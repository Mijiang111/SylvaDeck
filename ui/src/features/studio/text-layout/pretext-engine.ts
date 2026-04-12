import {
  layoutWithLines,
  prepareWithSegments,
  setLocale as setPretextLocale,
} from "@chenglou/pretext";
import {
  getPreparedTextLayoutHandle,
  setPreparedTextLayoutHandle,
} from "./text-layout-cache";
import type {
  MixedTextRun,
  PreparedTextLayoutHandle,
  TextLayoutFontDescriptor,
  TextLayoutListMeasureResult,
  TextLayoutMeasureResult,
  TextLayoutWhiteSpace,
  TextLayoutWordBreak,
} from "./text-layout-types";

const VERY_WIDE_TEXT_MEASURE_PX = 100_000;

function normalizeInlineText(text: string) {
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeMeasureWidth(width: number) {
  return Math.max(1, Math.round(width));
}

function normalizeLineHeight(lineHeight: number, fontSizePx: number) {
  if (Number.isFinite(lineHeight) && lineHeight > 0) {
    return lineHeight;
  }
  return Math.max(fontSizePx * 1.2, 1);
}

export function resolveFontDescriptorToCss(font: TextLayoutFontDescriptor) {
  const style = font.style?.trim() || "normal";
  const weight = font.weight?.trim() || "400";
  const family = font.family?.trim() || "Arial";
  const sizePx = Math.max(1, Math.round(font.sizePx));
  return `${style} ${weight} ${sizePx}px ${family}`;
}

function resolvePrepareKey(args: {
  text: string;
  font: string;
  whiteSpace: TextLayoutWhiteSpace;
  wordBreak: TextLayoutWordBreak;
  locale?: string;
}) {
  return JSON.stringify([
    args.text,
    args.font,
    args.whiteSpace,
    args.wordBreak,
    args.locale ?? "",
  ]);
}

export function prepareTextLayout(args: {
  text: string;
  font: string;
  whiteSpace?: TextLayoutWhiteSpace;
  wordBreak?: TextLayoutWordBreak;
  locale?: string;
}): PreparedTextLayoutHandle {
  const whiteSpace = args.whiteSpace ?? "normal";
  const wordBreak = args.wordBreak ?? "normal";
  const text = whiteSpace === "normal" ? normalizeInlineText(args.text) : args.text.replace(/\r\n?/g, "\n");
  const cacheKey = resolvePrepareKey({
    text,
    font: args.font,
    whiteSpace,
    wordBreak,
    locale: args.locale,
  });
  const cached = getPreparedTextLayoutHandle(cacheKey);
  if (cached) {
    return cached;
  }

  setPretextLocale(args.locale);
  const prepared = prepareWithSegments(text, args.font, { whiteSpace });
  return setPreparedTextLayoutHandle(cacheKey, {
    cacheKey,
    text,
    font: args.font,
    whiteSpace,
    wordBreak,
    locale: args.locale,
    prepared,
  });
}

export function measurePreparedTextLayout(args: {
  prepared: PreparedTextLayoutHandle;
  widthPx: number;
  lineHeightPx: number;
}): TextLayoutMeasureResult {
  const widthPx = normalizeMeasureWidth(args.widthPx);
  const lineHeightPx = Math.max(1, args.lineHeightPx);
  const wrapped = layoutWithLines(args.prepared.prepared, widthPx, lineHeightPx);
  const tight = layoutWithLines(args.prepared.prepared, VERY_WIDE_TEXT_MEASURE_PX, lineHeightPx);
  const lines = wrapped.lines.map((line) => ({
    text: line.text,
    width: line.width,
  }));
  return {
    height: wrapped.height,
    lineCount: wrapped.lineCount,
    maxLineWidth: Math.max(0, ...wrapped.lines.map((line) => line.width)),
    tightWidth: Math.max(0, ...tight.lines.map((line) => line.width)),
    lines,
  };
}

export function measureTextBlock(args: {
  text: string;
  widthPx: number;
  lineHeightPx: number;
  font: string;
  whiteSpace?: TextLayoutWhiteSpace;
  wordBreak?: TextLayoutWordBreak;
  locale?: string;
}): TextLayoutMeasureResult {
  const prepared = prepareTextLayout({
    text: args.text,
    font: args.font,
    whiteSpace: args.whiteSpace,
    wordBreak: args.wordBreak,
    locale: args.locale,
  });
  return measurePreparedTextLayout({
    prepared,
    widthPx: args.widthPx,
    lineHeightPx: args.lineHeightPx,
  });
}

export function measureListBlock(args: {
  items: string[];
  widthPx: number;
  lineHeightPx: number;
  font: string;
  whiteSpace?: TextLayoutWhiteSpace;
  wordBreak?: TextLayoutWordBreak;
  locale?: string;
  itemGapPx?: number;
  bulletIndentPx?: number;
}): TextLayoutListMeasureResult {
  const widthPx = normalizeMeasureWidth(args.widthPx);
  const bulletIndentPx = Math.max(0, Math.round(args.bulletIndentPx ?? 18));
  const contentWidth = Math.max(12, widthPx - bulletIndentPx);
  const itemGapPx = Math.max(0, args.itemGapPx ?? Math.round(args.lineHeightPx * 0.28));
  const itemHeights: number[] = [];
  const itemLineCounts: number[] = [];
  const lines: TextLayoutMeasureResult["lines"] = [];
  let height = 0;
  let maxLineWidth = 0;
  let tightWidth = 0;

  args.items.forEach((item, index) => {
    const result = measureTextBlock({
      text: item,
      widthPx: contentWidth,
      lineHeightPx: args.lineHeightPx,
      font: args.font,
      whiteSpace: args.whiteSpace,
      wordBreak: args.wordBreak,
      locale: args.locale,
    });
    itemHeights.push(result.height);
    itemLineCounts.push(result.lineCount);
    height += result.height;
    if (index > 0) {
      height += itemGapPx;
    }
    maxLineWidth = Math.max(maxLineWidth, result.maxLineWidth + bulletIndentPx);
    tightWidth = Math.max(tightWidth, result.tightWidth + bulletIndentPx);
    lines.push(
      ...result.lines.map((line) => ({
        text: line.text,
        width: line.width + bulletIndentPx,
      })),
    );
  });

  return {
    height,
    lineCount: itemLineCounts.reduce((sum, item) => sum + item, 0),
    maxLineWidth,
    tightWidth,
    lines,
    itemLineCounts,
    itemHeights,
  };
}

export function measureMixedTextRuns(args: {
  runs: MixedTextRun[];
  widthPx: number;
  baseFont: TextLayoutFontDescriptor;
  baseLineHeightPx: number;
  wordBreak?: TextLayoutWordBreak;
  locale?: string;
  gapPx?: number;
}): TextLayoutMeasureResult {
  const lineMeasurements: TextLayoutMeasureResult["lines"] = [];
  let height = 0;
  let lineCount = 0;
  let maxLineWidth = 0;
  let tightWidth = 0;

  args.runs.forEach((run, index) => {
    const fontDescriptor: TextLayoutFontDescriptor = {
      ...args.baseFont,
      ...run.font,
      sizePx: run.font?.sizePx ?? args.baseFont.sizePx,
    };
    const result = measureTextBlock({
      text: run.text,
      widthPx: args.widthPx,
      lineHeightPx: normalizeLineHeight(
        run.lineHeightPx ?? args.baseLineHeightPx,
        fontDescriptor.sizePx,
      ),
      font: resolveFontDescriptorToCss(fontDescriptor),
      whiteSpace: run.whiteSpace ?? "normal",
      wordBreak: args.wordBreak,
      locale: args.locale,
    });
    if (index > 0) {
      height += Math.max(0, args.gapPx ?? 0);
    }
    height += result.height;
    lineCount += result.lineCount;
    maxLineWidth = Math.max(maxLineWidth, result.maxLineWidth);
    tightWidth = Math.max(tightWidth, result.tightWidth);
    lineMeasurements.push(...result.lines);
  });

  return {
    height,
    lineCount,
    maxLineWidth,
    tightWidth,
    lines: lineMeasurements,
  };
}

export function measureFontSizedTextBlock(args: {
  text: string;
  widthPx: number;
  font: TextLayoutFontDescriptor;
  lineHeightPx?: number;
  whiteSpace?: TextLayoutWhiteSpace;
  wordBreak?: TextLayoutWordBreak;
  locale?: string;
}) {
  return measureTextBlock({
    text: args.text,
    widthPx: args.widthPx,
    lineHeightPx: normalizeLineHeight(args.lineHeightPx ?? 0, args.font.sizePx),
    font: resolveFontDescriptorToCss(args.font),
    whiteSpace: args.whiteSpace,
    wordBreak: args.wordBreak,
    locale: args.locale,
  });
}
