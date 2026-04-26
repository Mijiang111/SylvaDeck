import type { HtmlChartKind } from "@/features/studio/types";

export const PPT_LAYOUT = {
  widthInches: 13.333,
  heightInches: 7.5,
  pageWidthPx: 1600,
  pageHeightPx: 900,
} as const;

export const PX_PER_INCH = PPT_LAYOUT.pageWidthPx / PPT_LAYOUT.widthInches;

export type PptExportDiagnosticCode =
  | "html-report-missing"
  | "frame-missing"
  | "page-missing"
  | "block-missing"
  | "visual-missing"
  | "color-fallback"
  | "gradient-flattened"
  | "native-chart-exported"
  | "hybrid-chart-exported"
  | "chart-native-unsupported"
  | "chart-image-fallback"
  | "table-native-unsupported"
  | "visual-clipped";

export type PptExportWarningCode = PptExportDiagnosticCode;

export type PptExportDiagnosticSeverity = "success" | "info" | "degraded" | "fatal";

export type PptExportDiagnostic = {
  code: PptExportDiagnosticCode;
  severity?: PptExportDiagnosticSeverity;
  message: string;
  pageNumber?: number;
  sourceId?: string;
  sourceKind?: "deck" | "page" | "block" | "visual" | "chart" | "table" | "fallback";
  renderMode?: PptxExportEditability;
  countsAgainstQuality?: boolean;
};

export type PptExportWarning = PptExportDiagnostic;

export type PptExportSolidPaint = {
  type: "solid";
  color: string;
  transparency?: number;
};

export type PptExportLinearGradientPaint = {
  type: "linearGradient";
  angle: number;
  stops: Array<{
    color: string;
    transparency?: number;
    position: number;
  }>;
};

export type PptExportPaint =
  | {
      type: "none";
    }
  | PptExportSolidPaint
  | PptExportLinearGradientPaint;

export type PptExportTextNode = {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  items?: string[];
  fontSize: number;
  fontFamily?: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "mid" | "bottom";
  rotate?: number;
  fillColor?: string | null;
  lineSpacingMultiple?: number;
  paraSpaceAfterPt?: number;
  paraSpaceBeforePt?: number;
  listStyle?: {
    kind: "bullet" | "number";
    indentPt?: number;
    numberStartAt?: number;
  };
};

export type PptExportVisualNode = {
  kind: "shape";
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "roundRect" | "ellipse" | "line" | "freeform";
  paint: PptExportPaint;
  freeformPoints?: Array<{ x: number; y: number }>;
  lineColor?: string | null;
  lineTransparency?: number;
  lineWidthPt?: number;
  lineDash?: "dash" | "solid" | "sysDot";
  shadow?: {
    type: "outer";
    color: string;
    opacity: number;
    blurPt: number;
    offsetPt: number;
    angle: number;
  };
  sourceBounds?: PptxExportBounds;
  clipBounds?: PptxExportBounds;
  clipped?: boolean;
};

export type PptExportFallbackAsset = {
  kind: "svg";
  data: string;
  reason: "gradient-image-fallback" | "gradient-flattened" | "chart-image-fallback";
};

export type PptExportChartLayoutRole =
  | "chart-panel"
  | "annotation-rail"
  | "metric-strip"
  | "decision-footer";

export type PptExportChartThemeTokens = {
  textPrimary: string;
  textMuted: string;
  accent: string;
  dividerColor: string;
  surfaceFill: string;
  surfaceSecondary: string;
  chartPalette: string[];
};

export type PptExportChartSeries = {
  name: string;
  values: number[];
  color?: string;
  role?: "bar" | "line";
  axis?: "primary" | "secondary";
};

export type PptExportBubblePoint = {
  label: string;
  x: number;
  y: number;
  size: number;
  color?: string;
  group?: string | null;
};

export type PptExportMatrixItem = {
  label: string;
  detail?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  textColor?: string | null;
};

export type PptExportMatrixCallout = {
  title: string;
  body?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  textColor?: string | null;
  borderColor?: string | null;
};

export type PptExportMatrixQuadrant = {
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  textColor?: string | null;
};

export type PptExportSemanticChartSpec =
  | {
      kind: "line";
      labels: string[];
      series: PptExportChartSeries[];
      valueAxisMin?: number;
      valueAxisMax?: number;
      xAxisTitle?: string;
      yAxisTitle?: string;
    }
  | {
      kind: "waterfall";
      labels: string[];
      values: number[];
      colors: string[];
      yAxisTitle?: string;
    }
  | {
      kind: "bubble";
      points: PptExportBubblePoint[];
      xAxisTitle?: string;
      yAxisTitle?: string;
      sizeAxisTitle?: string;
    }
  | {
      kind: "matrix";
      xLabel: string;
      yLabel: string;
      xMinLabel?: string;
      xMaxLabel?: string;
      yMinLabel?: string;
      yMaxLabel?: string;
      plotBounds?: PptxExportBounds | null;
      quadrants?: PptExportMatrixQuadrant[];
      items: PptExportMatrixItem[];
      callout?: PptExportMatrixCallout | null;
      colors?: string[];
    };

export type PptExportChartModel = {
  kind: "chart";
  renderMode: "native" | "hybrid" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  insight?: string;
  layoutRole: PptExportChartLayoutRole;
  fallbackMode?:
    | "native-chart"
    | "native-combo-chart"
    | "native-bubble-chart"
    | "native-waterfall-chart"
    | "native-matrix-shapes"
    | "hybrid-waterfall"
    | "chart-image";
  chartKind?: Extract<HtmlChartKind, "bar" | "stacked" | "line" | "waterfall" | "combo" | "bubble" | "matrix">;
  frameBounds?: PptxExportBounds;
  semanticSpec?: PptExportSemanticChartSpec;
  labels: string[];
  series: PptExportChartSeries[];
  bubblePoints?: PptExportBubblePoint[];
  xAxisTitle?: string;
  yAxisTitle?: string;
  secondaryYAxisTitle?: string;
  sizeAxisTitle?: string;
  valueAxisMin?: number;
  valueAxisMax?: number;
  colors: string[];
  showInlineHeading?: boolean;
  themeTokens: PptExportChartThemeTokens;
  fallbackAsset?: PptExportFallbackAsset;
};

export type PptExportTableModel = {
  kind: "table";
  renderMode: "native" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  rows: string[][];
  headerRow?: boolean;
  themeTokens: PptExportChartThemeTokens;
  fallbackAsset?: PptExportFallbackAsset;
};

export type PptExportThemeSnapshot = {
  backgroundColor: string;
  surfaceFill: string;
  surfaceSecondary: string;
  dividerColor: string;
  accent: string;
  textPrimary: string;
  textMuted: string;
  chartPalette: string[];
  backgroundImageData?: string;
};

export type PptExportSlideModel = {
  pageNumber: number;
  title: string;
  backgroundColor: string;
  theme: PptExportThemeSnapshot;
  textNodes: PptExportTextNode[];
  shapeNodes: PptExportVisualNode[];
  chartNodes: PptExportChartModel[];
  tableNodes?: PptExportTableModel[];
};

export type PptxExportBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PptxExportEditability = "native" | "hybrid" | "image";

export type PptxExportIssueSeverity = PptExportDiagnosticSeverity;

export type PptxExportQualityIssue = {
  code:
    | "slide-empty"
    | "object-empty-text"
    | "object-out-of-bounds"
    | "object-too-small"
    | "object-image-fallback"
    | "object-hybrid-fallback"
    | "chart-unsupported"
    | "table-unsupported"
    | PptExportDiagnosticCode;
  severity: PptxExportIssueSeverity;
  message: string;
  pageNumber?: number;
  nodeId?: string;
  sourceId?: string;
  sourceKind?: PptExportDiagnostic["sourceKind"];
  renderMode?: PptxExportEditability;
  countsAgainstQuality?: boolean;
};

export type PptxExportNodeBase = {
  id: string;
  sourceId: string;
  sourceKind: "block" | "visual" | "chart" | "table" | "fallback";
  boundsIn: PptxExportBounds;
  editability: PptxExportEditability;
  qualityIssues: PptxExportQualityIssue[];
};

export type PptxExportTextNode = PptExportTextNode &
  PptxExportNodeBase & {
    nodeType: "text";
  };

export type PptxExportShapeNode = PptExportVisualNode &
  PptxExportNodeBase & {
    nodeType: "shape";
  };

export type PptxExportChartNode = PptExportChartModel &
  PptxExportNodeBase & {
    nodeType: "chart";
  };

export type PptxExportTableNode = PptExportTableModel &
  PptxExportNodeBase & {
    nodeType: "table";
  };

export type PptxExportNode =
  | PptxExportTextNode
  | PptxExportShapeNode
  | PptxExportChartNode
  | PptxExportTableNode;

export type PptxExportSlide = {
  pageNumber: number;
  title: string;
  backgroundColor: string;
  theme: PptExportThemeSnapshot;
  size: {
    widthInches: number;
    heightInches: number;
  };
  nodes: PptxExportNode[];
};

export type PptxExportDocument = {
  version: 1;
  layout: typeof PPT_LAYOUT;
  slides: PptxExportSlide[];
  diagnostics: PptExportDiagnostic[];
  warnings: PptExportWarning[];
};

export type PptxExportPageQualityReport = {
  pageNumber: number;
  issueCount: number;
  fatalCount: number;
  degradedCount: number;
  nativeObjectCount: number;
  fallbackObjectCount: number;
  issues: PptxExportQualityIssue[];
};

export type PptxExportQualityReport = {
  score: number;
  scoreBreakdown: {
    base: number;
    fatalPenalty: number;
    degradedPenalty: number;
    fallbackPenalty: number;
    final: number;
    countsAgainstQualityIssueCount: number;
  };
  nativeObjectCount: number;
  fallbackObjectCount: number;
  fallbackCountByReason: Record<string, number>;
  nativeChartCountByKind: Record<string, number>;
  acceptanceFailures: string[];
  fatalCount: number;
  degradedCount: number;
  issueCount: number;
  pages: PptxExportPageQualityReport[];
};

export type PptExportResult = {
  fileName: string;
  slideCount: number;
  warningCount: number;
  warnings: PptExportWarning[];
  diagnostics: PptExportDiagnostic[];
  slides: PptExportSlideModel[];
  qualityReport: PptxExportQualityReport;
};
