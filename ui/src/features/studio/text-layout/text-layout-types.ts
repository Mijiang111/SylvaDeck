import type { PreparedTextWithSegments } from "@chenglou/pretext";

export type TextLayoutWhiteSpace = "normal" | "pre-wrap";
export type TextLayoutWordBreak = "normal" | "break-word" | "break-all" | "keep-all";
export type TextLayoutOverflowRisk = "none" | "tight" | "overflow";

export type TextLayoutRole =
  | "title"
  | "headline"
  | "heading"
  | "paragraph"
  | "list"
  | "annotation"
  | "rail"
  | "badge"
  | "label"
  | "button"
  | "unknown";

export type TextLayoutFontDescriptor = {
  family: string;
  sizePx: number;
  weight?: string;
  style?: string;
};

export type PreparedTextLayoutHandle = {
  cacheKey: string;
  text: string;
  font: string;
  whiteSpace: TextLayoutWhiteSpace;
  wordBreak: TextLayoutWordBreak;
  locale?: string;
  prepared: PreparedTextWithSegments;
};

export type TextLayoutLineMeasurement = {
  text: string;
  width: number;
};

export type TextLayoutMeasureResult = {
  height: number;
  lineCount: number;
  maxLineWidth: number;
  tightWidth: number;
  lines: TextLayoutLineMeasurement[];
};

export type TextLayoutListMeasureResult = TextLayoutMeasureResult & {
  itemLineCounts: number[];
  itemHeights: number[];
};

export type MixedTextRun = {
  text: string;
  font?: Partial<TextLayoutFontDescriptor>;
  lineHeightPx?: number;
  whiteSpace?: TextLayoutWhiteSpace;
};

export type TextLayoutMeasurement = {
  blockId?: string | null;
  layoutId?: string | null;
  selector?: string | null;
  role: TextLayoutRole;
  width: number;
  fontSize: number;
  lineHeight: number;
  predictedHeight: number;
  predictedLineCount: number;
  actualHeight: number;
  tightWidth: number;
  overflowRisk: TextLayoutOverflowRisk;
  textPreview?: string | null;
};

export type PageTextLayoutPrediction = {
  textMeasurements: TextLayoutMeasurement[];
  predictedTextOverflow: boolean;
  predictedOverflowRoots: string[];
};
