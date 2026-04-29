import {
  PX_PER_INCH,
  type PptExportChartAxisStyle,
  type PptExportChartNativeStyle,
  type PptExportChartSeriesStyle,
  type PptExportChartShadowStyle,
  type PptExportPaint,
  type PptExportVisualNode,
} from "./types";

export const DEFAULT_BACKGROUND = "FBF8F2";
export const DEFAULT_SURFACE_FILL = "FFFFFF";
export const DEFAULT_DIVIDER = "D8D0C2";
export const DEFAULT_TEXT = "102838";
export const DEFAULT_BODY = "5B6B77";
export const DEFAULT_ACCENT = "C6994A";

export type ParsedSolidPaint = {
  type: "solid";
  hex: string;
  alpha: number;
};

export type ParsedGradientPaint = {
  type: "linear-gradient";
  angle: number;
  stops: Array<ParsedSolidPaint & { position?: number }>;
};

export type ParsedCssPaint = ParsedSolidPaint | ParsedGradientPaint;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseNumericValue(value: string) {
  const normalized = value.replace(/[^0-9.\-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function stripQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, "").trim();
}

export function primaryFontFamily(fontFamily?: string | null) {
  if (!fontFamily) {
    return undefined;
  }

  const family = fontFamily
    .split(",")
    .map((item) => stripQuotes(item))
    .find(Boolean);
  return family || undefined;
}

export function toTransparency(alpha?: number | null) {
  if (alpha === null || alpha === undefined) {
    return undefined;
  }

  return clamp(Math.round((1 - alpha) * 100), 0, 100);
}

export function pxToPoints(value: number) {
  return Number(Math.max(0, (value / PX_PER_INCH) * 72).toFixed(1));
}

export function splitCssTopLevelList(value: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

let cssColorCanvasContext: CanvasRenderingContext2D | null | undefined;

export function parseCssColor(value?: string | null): ParsedSolidPaint | null {
  if (!value) {
    return null;
  }

  const next = value.trim();
  if (!next || next === "transparent" || next === "inherit" || next === "currentColor") {
    return null;
  }

  const hexMatch = next.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    const expanded =
      raw.length === 3 || raw.length === 4
        ? raw
            .split("")
            .map((char) => char + char)
            .join("")
        : raw;
    const alpha =
      expanded.length === 8
        ? clamp(Number.parseInt(expanded.slice(6, 8), 16) / 255, 0, 1)
        : 1;
    return {
      type: "solid",
      hex: expanded.slice(0, 6).toUpperCase(),
      alpha,
    } satisfies ParsedSolidPaint;
  }

  const rgbMatch = next.match(
    /^rgba?\(\s*([0-9.]+%?)[,\s]+([0-9.]+%?)[,\s]+([0-9.]+%?)(?:[\/,\s]+([0-9.]+%?))?\s*\)$/i,
  );
  if (rgbMatch) {
    const parseChannel = (raw: string) =>
      raw.includes("%")
        ? clamp((Number.parseFloat(raw) / 100) * 255, 0, 255)
        : clamp(Number.parseFloat(raw), 0, 255);
    const parseAlpha = (raw?: string) => {
      if (raw === undefined) {
        return 1;
      }
      return raw.includes("%")
        ? clamp(Number.parseFloat(raw) / 100, 0, 1)
        : clamp(Number.parseFloat(raw), 0, 1);
    };

    const red = parseChannel(rgbMatch[1] ?? "0");
    const green = parseChannel(rgbMatch[2] ?? "0");
    const blue = parseChannel(rgbMatch[3] ?? "0");
    const alpha = parseAlpha(rgbMatch[4]);
    const hex = [red, green, blue]
      .map((channel) => Math.round(channel).toString(16).padStart(2, "0").toUpperCase())
      .join("");

    return { type: "solid", hex, alpha } satisfies ParsedSolidPaint;
  }

  if (typeof document !== "undefined") {
    cssColorCanvasContext ??= document.createElement("canvas").getContext("2d");
    if (cssColorCanvasContext) {
      cssColorCanvasContext.fillStyle = "#000000";
      cssColorCanvasContext.fillStyle = next;
      const normalized = cssColorCanvasContext.fillStyle;
      if (normalized && normalized !== next && normalized !== "#000000") {
        return parseCssColor(normalized);
      }
      if (/^black$/i.test(next)) {
        return { type: "solid", hex: "000000", alpha: 1 };
      }
    }
  }

  return null;
}

function normalizeChartDash(value: unknown): "solid" | "dash" | "dot" | undefined {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (normalized === "solid" || normalized === "dash" || normalized === "dot") {
    return normalized;
  }
  return undefined;
}

function normalizeChartDashOrNone(value: unknown): PptExportChartAxisStyle["lineDash"] | undefined {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (normalized === "none") {
    return "none";
  }
  return normalizeChartDash(normalized);
}

function normalizeChartStyleColor(value: unknown) {
  return parseCssColor(typeof value === "string" ? value : undefined)?.hex;
}

function normalizeChartShadowStyle(value: unknown): PptExportChartShadowStyle | null | undefined {
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Partial<PptExportChartShadowStyle>;
  const shadow: PptExportChartShadowStyle = {};
  const color = normalizeChartStyleColor(raw.color);
  if (color) {
    shadow.color = color;
  }
  const opacity = Number(raw.opacity);
  if (Number.isFinite(opacity)) {
    shadow.opacity = clamp(opacity, 0, 1);
  }
  const blurPt = Number(raw.blurPt);
  if (Number.isFinite(blurPt)) {
    shadow.blurPt = clamp(blurPt, 0, 60);
  }
  const offsetPt = Number(raw.offsetPt);
  if (Number.isFinite(offsetPt)) {
    shadow.offsetPt = clamp(offsetPt, 0, 60);
  }
  const angle = Number(raw.angle);
  if (Number.isFinite(angle)) {
    shadow.angle = ((angle % 360) + 360) % 360;
  }
  return Object.keys(shadow).length ? shadow : {};
}

function normalizeChartAxisStyle(value: unknown): PptExportChartAxisStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Partial<PptExportChartAxisStyle>;
  const style: PptExportChartAxisStyle = {};
  const lineColor = normalizeChartStyleColor(raw.lineColor);
  if (lineColor) {
    style.lineColor = lineColor;
  }
  const lineWidthPt = Number(raw.lineWidthPt);
  if (Number.isFinite(lineWidthPt)) {
    style.lineWidthPt = clamp(lineWidthPt, 0, 20);
  }
  const lineDash = normalizeChartDashOrNone(raw.lineDash);
  if (lineDash) {
    style.lineDash = lineDash;
  }
  const gridColor = normalizeChartStyleColor(raw.gridColor);
  if (gridColor) {
    style.gridColor = gridColor;
  }
  const gridWidthPt = Number(raw.gridWidthPt);
  if (Number.isFinite(gridWidthPt)) {
    style.gridWidthPt = clamp(gridWidthPt, 0, 20);
  }
  const gridDash = normalizeChartDashOrNone(raw.gridDash);
  if (gridDash) {
    style.gridDash = gridDash;
  }
  const labelColor = normalizeChartStyleColor(raw.labelColor);
  if (labelColor) {
    style.labelColor = labelColor;
  }
  const labelFontSize = Number(raw.labelFontSize);
  if (Number.isFinite(labelFontSize)) {
    style.labelFontSize = clamp(labelFontSize, 4, 72);
  }
  return Object.keys(style).length ? style : undefined;
}

export function normalizeChartNativeStyle(value: unknown): PptExportChartNativeStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Partial<PptExportChartNativeStyle>;
  const style: PptExportChartNativeStyle = {};
  const xAxis = normalizeChartAxisStyle(raw.xAxis);
  if (xAxis) {
    style.xAxis = xAxis;
  }
  const yAxis = normalizeChartAxisStyle(raw.yAxis);
  if (yAxis) {
    style.yAxis = yAxis;
  }
  const secondaryYAxis = normalizeChartAxisStyle(raw.secondaryYAxis);
  if (secondaryYAxis) {
    style.secondaryYAxis = secondaryYAxis;
  }
  if ("chartShadow" in raw) {
    const chartShadow = normalizeChartShadowStyle(raw.chartShadow);
    if (chartShadow !== undefined) {
      style.chartShadow = chartShadow;
    }
  }
  if ("plotShadow" in raw) {
    const plotShadow = normalizeChartShadowStyle(raw.plotShadow);
    if (plotShadow !== undefined) {
      style.plotShadow = plotShadow;
    }
  }
  const bubbleScale = Number(raw.bubbleScale);
  if (Number.isFinite(bubbleScale)) {
    style.bubbleScale = clamp(bubbleScale, 1, 300);
  }
  return Object.keys(style).length ? style : undefined;
}

export function normalizeChartSeriesStyle(value: unknown): PptExportChartSeriesStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Partial<PptExportChartSeriesStyle>;
  const style: PptExportChartSeriesStyle = {};
  const lineDash = normalizeChartDash(raw.lineDash);
  if (lineDash) {
    style.lineDash = lineDash;
  }
  const lineWidthPt = Number(raw.lineWidthPt);
  if (Number.isFinite(lineWidthPt)) {
    style.lineWidthPt = clamp(lineWidthPt, 0, 20);
  }
  if (raw.marker === "circle" || raw.marker === "none") {
    style.marker = raw.marker;
  }
  if ("shadow" in raw) {
    const shadow = normalizeChartShadowStyle(raw.shadow);
    if (shadow !== undefined) {
      style.shadow = shadow;
    }
  }
  return Object.keys(style).length ? style : undefined;
}

export function parseLinearGradient(value?: string | null): ParsedGradientPaint | null {
  if (!value) {
    return null;
  }

  const next = value.trim();
  const gradientMatch = next.match(/^linear-gradient\((.*)\)$/i);
  if (!gradientMatch?.[1]) {
    return null;
  }

  const parts = splitCssTopLevelList(gradientMatch[1]);
  if (parts.length < 2) {
    return null;
  }

  let angle = 180;
  let stopParts = parts;
  const firstPart = parts[0]?.toLowerCase() ?? "";
  if (firstPart.startsWith("to ")) {
    stopParts = parts.slice(1);
    const direction = firstPart.replace(/^to\s+/, "").trim();
    const hasTop = direction.includes("top");
    const hasBottom = direction.includes("bottom");
    const hasLeft = direction.includes("left");
    const hasRight = direction.includes("right");
    if (hasTop && hasRight) {
      angle = 45;
    } else if (hasBottom && hasRight) {
      angle = 135;
    } else if (hasBottom && hasLeft) {
      angle = 225;
    } else if (hasTop && hasLeft) {
      angle = 315;
    } else if (hasRight) {
      angle = 90;
    } else if (hasBottom) {
      angle = 180;
    } else if (hasLeft) {
      angle = 270;
    } else if (hasTop) {
      angle = 0;
    }
  } else {
    const angleMatch = firstPart.match(/^(-?[0-9.]+)(deg|rad|turn|grad)$/i);
    if (angleMatch?.[1] && angleMatch[2]) {
      stopParts = parts.slice(1);
      const rawAngle = Number.parseFloat(angleMatch[1]);
      const unit = angleMatch[2].toLowerCase();
      if (Number.isFinite(rawAngle)) {
        if (unit === "rad") {
          angle = (rawAngle * 180) / Math.PI;
        } else if (unit === "turn") {
          angle = rawAngle * 360;
        } else if (unit === "grad") {
          angle = rawAngle * 0.9;
        } else {
          angle = rawAngle;
        }
      }
    }
  }

  const parsedStops: Array<ParsedSolidPaint & { position?: number }> = [];
  for (const part of stopParts) {
    const colorMatch = part.match(
      /^\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)\s*(.*)$/i,
    );
    const color = parseCssColor(colorMatch?.[1] ?? "");
    if (!color) {
      continue;
    }
    const positionMatch = colorMatch?.[2]?.match(/(-?[0-9.]+)%/);
    const position = positionMatch?.[1]
      ? clamp(Math.round(Number.parseFloat(positionMatch[1]) * 1000), 0, 100000)
      : undefined;
    parsedStops.push(position === undefined ? color : { ...color, position });
  }

  if (parsedStops.length < 2) {
    return null;
  }

  const stops = parsedStops.map((stop, index) => {
    const fallbackPosition =
      parsedStops.length <= 1
        ? 0
        : Math.round((index / Math.max(1, parsedStops.length - 1)) * 100000);
    return {
      type: "solid" as const,
      hex: stop.hex,
      alpha: stop.alpha,
      position: stop.position ?? fallbackPosition,
    };
  });

  return {
    type: "linear-gradient",
    angle: ((angle % 360) + 360) % 360,
    stops,
  };
}

export function parseCssPaint(value?: string | null): ParsedCssPaint | null {
  return parseLinearGradient(value) ?? parseCssColor(value);
}

export function alphaIsVisible(paint: ParsedCssPaint | null) {
  if (!paint) {
    return false;
  }
  if (paint.type === "solid") {
    return paint.alpha > 0;
  }
  return paint.stops.some((stop) => stop.alpha > 0);
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function createSvgDataUri(svg: string) {
  return `data:image/svg+xml;base64,${encodeBase64Utf8(svg)}`;
}

export function createLinearGradientSvg(args: {
  width: number;
  height: number;
  gradient: ParsedGradientPaint;
  radius?: number;
}) {
  const { width, height, gradient } = args;
  const svgAngle = ((450 - gradient.angle) % 360 + 360) % 360;
  const radians = (svgAngle * Math.PI) / 180;
  const x1 = 50 - Math.cos(radians) * 50;
  const y1 = 50 + Math.sin(radians) * 50;
  const x2 = 50 + Math.cos(radians) * 50;
  const y2 = 50 - Math.sin(radians) * 50;
  const radius = Math.max(0, args.radius ?? 0);

  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
          <stop offset="0%" stop-color="#${gradient.stops[0].hex}" stop-opacity="${gradient.stops[0].alpha}" />
          <stop offset="100%" stop-color="#${gradient.stops[1].hex}" stop-opacity="${gradient.stops[1].alpha}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#g)" />
    </svg>
  `);
}

export function readElementFillPaint(args: {
  element: HTMLElement;
  computed: CSSStyleDeclaration;
}) {
  const backgroundImage = args.computed.backgroundImage;
  if (backgroundImage && backgroundImage !== "none") {
    const gradient = parseLinearGradient(backgroundImage);
    if (gradient) {
      return gradient;
    }
  }

  const computedColor = parseCssColor(args.computed.backgroundColor);
  if (alphaIsVisible(computedColor)) {
    return computedColor;
  }

  return computedColor;
}

export function nonePaint(): PptExportPaint {
  return { type: "none" };
}

export function paintFromCssPaint(paint: ParsedCssPaint | null, opacity: number): PptExportPaint {
  if (!paint) {
    return nonePaint();
  }

  if (paint.type === "solid") {
    return {
      type: "solid",
      color: paint.hex,
      transparency: toTransparency(paint.alpha * opacity),
    };
  }

  return {
    type: "linearGradient",
    angle: paint.angle,
    stops: paint.stops.map((stop, index) => ({
      color: stop.hex,
      transparency: toTransparency(stop.alpha * opacity),
      position:
        stop.position ??
        (paint.stops.length <= 1
          ? 0
          : Math.round((index / Math.max(1, paint.stops.length - 1)) * 100000)),
    })),
  };
}

export function resolveComputedBorderPaint(computed: CSSStyleDeclaration) {
  const width = Number.parseFloat(computed.borderWidth || "0");
  if (!Number.isFinite(width) || width <= 0 || computed.borderStyle === "none") {
    return null;
  }

  return parseCssColor(computed.borderColor);
}

export function resolveLineDash(computed: CSSStyleDeclaration): PptExportVisualNode["lineDash"] {
  if (computed.borderStyle === "dotted") {
    return "sysDot";
  }
  if (computed.borderStyle === "dashed") {
    return "dash";
  }
  return "solid";
}

function extractShadowColorToken(value: string) {
  const matches = Array.from(value.matchAll(/#[0-9a-f]{3,8}|rgba?\([^)]*\)|\b[a-z]+\b/gi));
  for (const match of matches) {
    const token = match[0];
    const color = parseCssColor(token);
    if (color) {
      return { token, color };
    }
  }
  return null;
}

export function resolveBoxShadow(computed: CSSStyleDeclaration, opacity: number): PptExportVisualNode["shadow"] {
  const rawShadow = computed.boxShadow;
  if (!rawShadow || rawShadow === "none") {
    return undefined;
  }

  for (const layer of splitCssTopLevelList(rawShadow)) {
    if (/\binset\b/i.test(layer)) {
      continue;
    }

    const colorToken = extractShadowColorToken(layer);
    if (!colorToken || colorToken.color.alpha <= 0) {
      continue;
    }

    const numericPart = layer.replace(colorToken.token, "").replace(/\binset\b/gi, "");
    const lengths = Array.from(numericPart.matchAll(/(-?[0-9.]+)px/gi)).map((match) =>
      Number.parseFloat(match[1] ?? "0"),
    );
    const offsetX = lengths[0] ?? 0;
    const offsetY = lengths[1] ?? 0;
    const blurPx = Math.max(0, lengths[2] ?? 0);
    const distancePx = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    const effectiveOpacity = clamp(colorToken.color.alpha * opacity, 0, 1);
    if (effectiveOpacity <= 0 || (blurPx <= 0 && distancePx <= 0)) {
      continue;
    }

    const rawAngle = (Math.atan2(offsetY, offsetX) * 180) / Math.PI;
    const angle = Math.round(((rawAngle % 360) + 360) % 360);
    return {
      type: "outer",
      color: colorToken.color.hex,
      opacity: effectiveOpacity,
      blurPt: pxToPoints(blurPx),
      offsetPt: pxToPoints(distancePx),
      angle,
    };
  }

  return undefined;
}

export function resolveBorderRadiusPx(computed: CSSStyleDeclaration, rect: { w: number; h: number }) {
  const raw = computed.borderTopLeftRadius || computed.borderRadius || "0";
  const first = raw.split(/\s+/)[0] ?? "0";
  const parsed = Number.parseFloat(first);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (first.includes("%")) {
    return (Math.min(rect.w, rect.h) * parsed) / 100;
  }

  return parsed;
}
