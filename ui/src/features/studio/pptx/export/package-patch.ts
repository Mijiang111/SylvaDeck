import JSZip from "jszip";
import { clamp, parseCssColor } from "./style";
import {
  type PptExportChartAxisStyle,
  type PptExportBubblePoint,
  type PptExportChartSeries,
  type PptExportChartSeriesStyle,
  type PptExportChartShadowStyle,
  type PptExportDiagnostic,
  type PptExportPaint,
  type PptxExportChartNode,
  type PptxExportDocument,
  type PptxExportShapeNode,
  type PptxExportSlide,
} from "./types";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pointsToEmu(value: number | undefined, fallback: number) {
  const next = Number.isFinite(value) ? value! : fallback;
  return Math.round(Math.max(0.01, next) * 12700);
}

function chartDashToPreset(value: "solid" | "dash" | "dot" | "none" | undefined) {
  if (value === "dot") {
    return "dot";
  }
  if (value === "dash") {
    return "dash";
  }
  return "solid";
}

function buildChartColorElement(color: string | null | undefined, opacity = 1) {
  const normalizedHex = typeof color === "string" ? color.trim().replace(/^#/, "").toUpperCase() : "";
  const parsed = /^[0-9A-F]{6}$/.test(normalizedHex) ? { hex: normalizedHex, alpha: 1 } : parseCssColor(color);
  const hex = parsed?.hex ?? "000000";
  const alpha = Math.round(clamp((parsed?.alpha ?? 1) * opacity, 0, 1) * 100000);
  return `<a:srgbClr val="${escapeXml(hex)}">${alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ""}</a:srgbClr>`;
}

function buildChartSolidFillXml(color: string | null | undefined, opacity = 1) {
  return `<a:solidFill>${buildChartColorElement(color, opacity)}</a:solidFill>`;
}

function buildChartLineXml(args: {
  color?: string | null;
  widthPt?: number;
  dash?: "solid" | "dash" | "dot" | "none";
  fallbackColor: string;
  fallbackWidthPt: number;
}) {
  if (args.dash === "none") {
    return `<a:ln w="${pointsToEmu(args.widthPt, args.fallbackWidthPt)}" cap="flat"><a:noFill/><a:prstDash val="solid"/><a:round/></a:ln>`;
  }
  return `<a:ln w="${pointsToEmu(args.widthPt, args.fallbackWidthPt)}" cap="round">${buildChartSolidFillXml(
    args.color ?? args.fallbackColor,
  )}<a:prstDash val="${chartDashToPreset(args.dash)}"/><a:round/></a:ln>`;
}

function resolveChartShadow(style: PptExportChartShadowStyle) {
  return {
    color: style.color ?? "000000",
    opacity: style.opacity ?? 0.18,
    blurPt: style.blurPt ?? 4,
    offsetPt: style.offsetPt ?? 1,
    angle: style.angle ?? 45,
  };
}

function buildChartShadowXml(style: PptExportChartShadowStyle | null | undefined) {
  if (style === null || style === undefined) {
    return "";
  }
  const shadow = resolveChartShadow(style);
  const alpha = Math.round(clamp(shadow.opacity, 0, 1) * 100000);
  const direction = Math.round((((shadow.angle % 360) + 360) % 360) * 60000);
  return `<a:effectLst><a:outerShdw blurRad="${pointsToEmu(shadow.blurPt, 4)}" dist="${pointsToEmu(
    shadow.offsetPt,
    1,
  )}" dir="${direction}" algn="ctr" rotWithShape="0">${buildChartColorElement(
    shadow.color,
    alpha / 100000,
  )}</a:outerShdw></a:effectLst>`;
}

function replaceOrInsertAfter(xml: string, pattern: RegExp, replacement: string, afterPattern: RegExp) {
  if (pattern.test(xml)) {
    return xml.replace(pattern, replacement);
  }
  return xml.replace(afterPattern, (match) => `${match}${replacement}`);
}

function buildGradientFillXml(paint: Extract<PptExportPaint, { type: "linearGradient" }>) {
  const angle = Math.round((((450 - paint.angle) % 360) + 360) % 360) * 60000;
  const stops = paint.stops.length
    ? paint.stops
    : [
        { color: "FFFFFF", position: 0, transparency: 0 },
        { color: "FFFFFF", position: 100000, transparency: 0 },
      ];

  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops
    .map((stop) => {
      const alpha = Math.round((100 - (stop.transparency ?? 0)) * 1000);
      return `<a:gs pos="${clamp(stop.position, 0, 100000)}"><a:srgbClr val="${escapeXml(stop.color)}">${
        alpha < 100000 ? `<a:alpha val="${clamp(alpha, 0, 100000)}"/>` : ""
      }</a:srgbClr></a:gs>`;
    })
    .join("")}</a:gsLst><a:lin ang="${angle}" scaled="0"/></a:gradFill>`;
}

function replaceShapeFillXml(shapeXml: string, fillXml: string) {
  const fillPattern = /<a:(?:solidFill|gradFill)\b[\s\S]*?<\/a:(?:solidFill|gradFill)>|<a:noFill\s*\/>/;
  if (fillPattern.test(shapeXml)) {
    return shapeXml.replace(fillPattern, fillXml);
  }

  return shapeXml.replace(/(<a:prstGeom\b[\s\S]*?<\/a:prstGeom>)/, `$1${fillXml}`);
}

function buildFreeformGeometryXml(shape: PptxExportShapeNode) {
  const points = shape.freeformPoints ?? [];
  if (shape.shape !== "freeform" || points.length < 3) {
    return null;
  }

  const normalizedPoints = points.map((point) => ({
    x: Math.round(clamp(point.x, 0, 100000)),
    y: Math.round(clamp(point.y, 0, 100000)),
  }));
  const [firstPoint, ...remainingPoints] = normalizedPoints;
  if (!firstPoint) {
    return null;
  }

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="100000" h="100000"><a:moveTo><a:pt x="${firstPoint.x}" y="${firstPoint.y}"/></a:moveTo>${remainingPoints
    .map((point) => `<a:lnTo><a:pt x="${point.x}" y="${point.y}"/></a:lnTo>`)
    .join("")}<a:close/></a:path></a:pathLst></a:custGeom>`;
}

function replaceShapeGeometryXml(shapeXml: string, geometryXml: string) {
  const geometryPattern = /<a:(?:prstGeom|custGeom)\b[\s\S]*?<\/a:(?:prstGeom|custGeom)>/;
  if (geometryPattern.test(shapeXml)) {
    return shapeXml.replace(geometryPattern, geometryXml);
  }

  return shapeXml;
}

function patchZeroSizeExtentAttribute(attrs: string, name: "cx" | "cy") {
  const pattern = new RegExp(`\\b${name}="(-?\\d+)"`);
  const match = attrs.match(pattern);
  const value = Number.parseInt(match?.[1] ?? "1", 10);
  if (Number.isFinite(value) && value > 0) {
    return attrs;
  }
  if (match) {
    return attrs.replace(pattern, `${name}="1"`);
  }
  return `${attrs}${/\s$/.test(attrs) || attrs.length === 0 ? "" : " "}${name}="1"`;
}

function patchZeroSizeExtents(xml: string) {
  return xml.replace(/<a:ext\b([^>]*)\/>/g, (match, rawAttributes: string) => {
    const cx = Number.parseInt(rawAttributes.match(/\bcx="(-?\d+)"/)?.[1] ?? "1", 10);
    const cy = Number.parseInt(rawAttributes.match(/\bcy="(-?\d+)"/)?.[1] ?? "1", 10);
    if (cx > 0 && cy > 0) {
      return match;
    }
    const patchedAttributes = patchZeroSizeExtentAttribute(
      patchZeroSizeExtentAttribute(rawAttributes, "cx"),
      "cy",
    );
    return `<a:ext${patchedAttributes}/>`;
  });
}

async function patchPackageZeroSizeExtents(zip: JSZip) {
  const xmlEntries = Object.keys(zip.files).filter(
    (name) => !zip.files[name]?.dir && /\.xml$/i.test(name),
  );
  await Promise.all(
    xmlEntries.map(async (fileName) => {
      const file = zip.file(fileName);
      const xml = await file?.async("string");
      if (xml === undefined) {
        return;
      }
      const patchedXml = patchZeroSizeExtents(xml);
      if (patchedXml !== xml) {
        zip.file(fileName, patchedXml);
      }
    }),
  );
}

function patchSlideNativeShapes(xml: string, shapes: PptxExportShapeNode[]) {
  let nextXml = xml;

  for (const shape of shapes) {
    const objectName = escapeRegExp(escapeXml(shape.id));
    const shapePattern = new RegExp(
      `(<p:sp>[\\s\\S]*?<p:cNvPr\\b[^>]*\\bname="${objectName}"[^>]*>[\\s\\S]*?<p:spPr>)([\\s\\S]*?)(</p:spPr>[\\s\\S]*?</p:sp>)`,
    );
    nextXml = nextXml.replace(shapePattern, (_match, prefix, shapeBody, suffix) => {
      let patchedShapeBody = shapeBody;
      const geometryXml = buildFreeformGeometryXml(shape);
      if (geometryXml) {
        patchedShapeBody = replaceShapeGeometryXml(patchedShapeBody, geometryXml);
      }
      if (shape.paint.type === "linearGradient") {
        patchedShapeBody = replaceShapeFillXml(patchedShapeBody, buildGradientFillXml(shape.paint));
      }
      return `${prefix}${patchedShapeBody}${suffix}`;
    });
  }

  return nextXml;
}

function shouldHideNativeChartFrame(chartNode: PptxExportChartNode) {
  return (
    chartNode.renderMode === "native" &&
    chartNode.showNativeVisual === false &&
    chartNode.chartKind !== "matrix"
  );
}

function hideChartGraphicFrameXml(frameXml: string) {
  let nextXml = frameXml.replace(/<p:cNvPr\b([^>]*)>/, (match, rawAttributes: string) => {
    const selfClosing = /\/\s*>$/.test(match);
    const attributes = rawAttributes
      .replace(/\/\s*$/, "")
      .replace(/\s+\bhidden="[^"]*"/, "")
      .replace(/\s+\bdescr="[^"]*"/, "")
      .trim();
    const prefix = attributes ? ` ${attributes}` : "";
    return `<p:cNvPr${prefix} hidden="1" descr="hidden-native-chart-data"${
      selfClosing ? "/>" : ">"
    }`;
  });
  nextXml = nextXml.replace(/<a:off\b[^>]*\/>/, '<a:off x="0" y="0"/>');
  nextXml = nextXml.replace(/<a:ext\b[^>]*\/>/, '<a:ext cx="1" cy="1"/>');
  return nextXml;
}

function patchHiddenNativeChartFrames(xml: string, hiddenChartCount: number) {
  if (hiddenChartCount <= 0) {
    return xml;
  }

  let chartIndex = 0;
  return xml.replace(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g, (frameXml) => {
    if (!/<c:chart\b|\/chart/i.test(frameXml)) {
      return frameXml;
    }

    const shouldHide = chartIndex < hiddenChartCount;
    chartIndex += 1;
    return shouldHide ? hideChartGraphicFrameXml(frameXml) : frameXml;
  });
}

function parsePptxRelationships(xml: string | undefined) {
  if (!xml) {
    return [];
  }
  return Array.from(xml.matchAll(/<Relationship\b([^>]*)\/?>/g)).map((match) => {
    const attrs = match[1] ?? "";
    const readAttr = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
    return {
      id: readAttr("Id"),
      type: readAttr("Type"),
      target: readAttr("Target"),
    };
  });
}

function parseSlideChartFrameRelationshipIds(xml: string) {
  return Array.from(xml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g))
    .map((match) => match[0] ?? "")
    .filter((frameXml) => /<c:chart\b|\/chart/i.test(frameXml))
    .map((frameXml) => frameXml.match(/<c:chart\b[^>]*\br:id="([^"]+)"/i)?.[1])
    .filter((item): item is string => Boolean(item));
}

function nativeChartNodesInRenderOrder(slide: PptxExportSlide) {
  return slide.nodes.filter(
    (node): node is PptxExportChartNode =>
      node.nodeType === "chart" && node.renderMode === "native" && node.chartKind !== "matrix",
  );
}

function chartNodeNeedsXmlPatch(node: PptxExportChartNode) {
  if (node.chartKind === "bubble") {
    return true;
  }
  return Boolean(node.style) || node.series.some((series) => Boolean(series.style));
}

function tagBlockPattern(tagName: string) {
  return new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "g");
}

function patchFirstTagBlock(xml: string, tagName: string, patcher: (block: string) => string) {
  let patched = false;
  return xml.replace(tagBlockPattern(tagName), (block) => {
    if (patched) {
      return block;
    }
    patched = true;
    return patcher(block);
  });
}

function patchTagBlocks(xml: string, tagName: string, patcher: (block: string, index: number) => string) {
  let index = 0;
  return xml.replace(tagBlockPattern(tagName), (block) => patcher(block, index++));
}

function patchChartTypeBlock(xml: string, chartTag: string, patcher: (block: string) => string) {
  return patchFirstTagBlock(xml, `c:${chartTag}`, patcher);
}

function replaceSeriesSpPr(serXml: string, spPrXml: string) {
  return replaceOrInsertAfter(
    serXml,
    /<c:spPr\b[\s\S]*?<\/c:spPr>/,
    spPrXml,
    /<\/c:tx>/,
  );
}

function replaceSeriesMarker(serXml: string, style: PptExportChartSeriesStyle | undefined) {
  if (!style?.marker) {
    return serXml;
  }
  const markerXml = `<c:marker><c:symbol val="${style.marker}"/></c:marker>`;
  return replaceOrInsertAfter(
    serXml,
    /<c:marker\b[\s\S]*?<\/c:marker>/,
    markerXml,
    /<\/c:spPr>/,
  );
}

function patchLineSeriesXml(serXml: string, series: PptExportChartSeries, fallbackColor: string) {
  if (!series.style) {
    return serXml;
  }
  const color = series.color ?? fallbackColor;
  const lineXml = buildChartLineXml({
    color,
    widthPt: series.style.lineWidthPt,
    dash: series.style.lineDash,
    fallbackColor: color,
    fallbackWidthPt: 2.8,
  });
  const spPrXml = `<c:spPr><a:noFill/>${lineXml}${buildChartShadowXml(series.style.shadow)}</c:spPr>`;
  return replaceSeriesMarker(replaceSeriesSpPr(serXml, spPrXml), series.style);
}

function patchLineChartSeriesXml(xml: string, chartNode: PptxExportChartNode) {
  const fallbackColors = chartNode.colors.length ? chartNode.colors : chartNode.themeTokens.chartPalette;
  const lineSeries =
    chartNode.chartKind === "combo"
      ? chartNode.series.filter((series) => (series.role ?? "bar") === "line")
      : chartNode.series;
  if (!lineSeries.some((series) => Boolean(series.style))) {
    return xml;
  }
  return patchChartTypeBlock(xml, "lineChart", (lineChartXml) =>
    patchTagBlocks(lineChartXml, "c:ser", (serXml, index) => {
      const series = lineSeries[index];
      if (!series) {
        return serXml;
      }
      const fallbackColor = fallbackColors[index % Math.max(1, fallbackColors.length)] ?? chartNode.themeTokens.accent;
      return patchLineSeriesXml(serXml, series, fallbackColor);
    }),
  );
}

function buildBubblePointDataXml(point: PptExportBubblePoint, index: number, fallbackColor: string) {
  const color = point.color ?? fallbackColor;
  return `<c:dPt><c:idx val="${index}"/><c:bubble3D val="0"/><c:spPr>${buildChartSolidFillXml(
    color,
    0.82,
  )}<a:ln w="${pointsToEmu(0.75, 0.75)}" cap="flat">${buildChartSolidFillXml(
    "FFFFFF",
  )}<a:prstDash val="solid"/><a:round/></a:ln></c:spPr></c:dPt>`;
}

function buildChartLabelRichText(label: string, color: string, fontSize: number) {
  return `<c:tx><c:rich><a:bodyPr><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:rPr lang="en-US" dirty="0" sz="${Math.round(
    fontSize * 100,
  )}">${buildChartSolidFillXml(color)}</a:rPr><a:t>${escapeXml(label)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></c:rich></c:tx>`;
}

function buildBubbleDataLabelsXml(chartNode: PptxExportChartNode) {
  const points = chartNode.bubblePoints ?? [];
  const labelColor = chartNode.style?.yAxis?.labelColor ?? chartNode.themeTokens.textPrimary;
  const fontSize = chartNode.style?.yAxis?.labelFontSize ?? 8;
  return `<c:dLbls>${points
    .map(
      (point, index) =>
        `<c:dLbl><c:idx val="${index}"/>${buildChartLabelRichText(
          point.label,
          labelColor,
          fontSize,
        )}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr><c:dLblPos val="r"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>`,
    )
    .join("")}<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
}

function patchBubbleSeriesXml(serXml: string, chartNode: PptxExportChartNode) {
  const points = chartNode.bubblePoints ?? [];
  const fallbackColors = chartNode.colors.length ? chartNode.colors : chartNode.themeTokens.chartPalette;
  const withoutExistingDataPoints = serXml.replace(/<c:dPt\b[\s\S]*?<\/c:dPt>/g, "");
  const pointXml = points
    .map((point, index) =>
      buildBubblePointDataXml(
        point,
        index,
        fallbackColors[index % Math.max(1, fallbackColors.length)] ?? chartNode.themeTokens.accent,
      ),
    )
    .join("");
  if (/<c:spPr\b[\s\S]*?<\/c:spPr>/.test(withoutExistingDataPoints)) {
    return withoutExistingDataPoints.replace(/(<c:spPr\b[\s\S]*?<\/c:spPr>)/, `$1${pointXml}`);
  }
  return withoutExistingDataPoints.replace(/<\/c:tx>/, `</c:tx>${pointXml}`);
}

function patchBubbleChartSeriesXml(bubbleChartXml: string, chartNode: PptxExportChartNode) {
  const seriesBlocks = Array.from(bubbleChartXml.matchAll(tagBlockPattern("c:ser"))).map((match) => match[0] ?? "");
  if (!seriesBlocks.length) {
    return bubbleChartXml;
  }

  const preferredSeriesIndex = Math.max(
    0,
    seriesBlocks.findIndex((serXml) => /<c:bubbleSize\b/i.test(serXml)),
  );
  let seriesIndex = 0;
  return bubbleChartXml.replace(tagBlockPattern("c:ser"), (serXml) => {
    const shouldKeep = seriesIndex === preferredSeriesIndex;
    seriesIndex += 1;
    return shouldKeep ? patchBubbleSeriesXml(serXml, chartNode) : "";
  });
}

function patchBubbleChartXml(xml: string, chartNode: PptxExportChartNode) {
  if (chartNode.chartKind !== "bubble") {
    return xml;
  }
  const bubbleScale = Math.round(clamp(chartNode.style?.bubbleScale ?? 70, 1, 300));
  return patchChartTypeBlock(xml, "bubbleChart", (bubbleChartXml) => {
    let nextBubbleChartXml = patchBubbleChartSeriesXml(bubbleChartXml, chartNode);
    nextBubbleChartXml = nextBubbleChartXml.replace(/<c:dLbls\b[\s\S]*?<\/c:dLbls>/g, "");
    nextBubbleChartXml = nextBubbleChartXml.replace(
      /(<\/c:ser>)/,
      `$1${buildBubbleDataLabelsXml(chartNode)}`,
    );
    if (/<c:bubbleScale\b/.test(nextBubbleChartXml)) {
      nextBubbleChartXml = nextBubbleChartXml.replace(/<c:bubbleScale\b[^>]*\/>/, `<c:bubbleScale val="${bubbleScale}"/>`);
    } else {
      nextBubbleChartXml = nextBubbleChartXml.replace(
        /(<c:axId\b[^>]*\/>)/,
        `<c:bubbleScale val="${bubbleScale}"/>$1`,
      );
    }
    return nextBubbleChartXml;
  });
}

function axisStyleHasLine(style?: PptExportChartAxisStyle) {
  return Boolean(style?.lineColor || style?.lineWidthPt !== undefined || style?.lineDash);
}

function axisStyleHasGrid(style?: PptExportChartAxisStyle) {
  return Boolean(style?.gridColor || style?.gridWidthPt !== undefined || style?.gridDash);
}

function buildAxisLineSpPrXml(style: PptExportChartAxisStyle, fallbackColor: string) {
  return `<c:spPr>${buildChartLineXml({
    color: style.lineColor,
    widthPt: style.lineWidthPt,
    dash: style.lineDash,
    fallbackColor,
    fallbackWidthPt: 0.9,
  })}</c:spPr>`;
}

function buildAxisGridXml(style: PptExportChartAxisStyle, fallbackColor: string) {
  return `<c:majorGridlines><c:spPr>${buildChartLineXml({
    color: style.gridColor,
    widthPt: style.gridWidthPt,
    dash: style.gridDash,
    fallbackColor,
    fallbackWidthPt: 0.75,
  })}</c:spPr></c:majorGridlines>`;
}

function patchAxisTextStyle(axisXml: string, style: PptExportChartAxisStyle | undefined) {
  if (!style?.labelColor && style?.labelFontSize === undefined) {
    return axisXml;
  }
  return axisXml.replace(/<a:defRPr\b([^>]*)>([\s\S]*?)<\/a:defRPr>/, (match, rawAttrs: string, body: string) => {
    let attrs = rawAttrs;
    if (style.labelFontSize !== undefined) {
      if (/\bsz="[^"]*"/.test(attrs)) {
        attrs = attrs.replace(/\bsz="[^"]*"/, `sz="${Math.round(style.labelFontSize * 100)}"`);
      } else {
        attrs += ` sz="${Math.round(style.labelFontSize * 100)}"`;
      }
    }
    const nextBody = style.labelColor
      ? body.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/, buildChartSolidFillXml(style.labelColor))
      : body;
    return `<a:defRPr${attrs}>${nextBody}</a:defRPr>`;
  });
}

function patchAxisBlockXml(axisXml: string, style: PptExportChartAxisStyle | undefined, fallbackColor: string) {
  if (!style) {
    return axisXml;
  }
  let nextAxisXml = axisXml;
  if (axisStyleHasGrid(style)) {
    const gridXml = buildAxisGridXml(style, fallbackColor);
    if (/<c:majorGridlines\b/.test(nextAxisXml)) {
      nextAxisXml = nextAxisXml.replace(/<c:majorGridlines\b[\s\S]*?<\/c:majorGridlines>/, gridXml);
    } else {
      nextAxisXml = nextAxisXml.replace(/(<c:axPos\b[^>]*\/>)/, `$1${gridXml}`);
    }
  }
  if (axisStyleHasLine(style)) {
    const lineXml = buildAxisLineSpPrXml(style, fallbackColor);
    nextAxisXml = nextAxisXml.replace(/(<c:tickLblPos\b[^>]*\/>[\s\S]*?)<c:spPr\b[\s\S]*?<\/c:spPr>/, `$1${lineXml}`);
  }
  return patchAxisTextStyle(nextAxisXml, style);
}

function patchNthAxisXml(xml: string, tagName: "c:catAx" | "c:valAx", targetIndex: number, style: PptExportChartAxisStyle | undefined, fallbackColor: string) {
  if (!style) {
    return xml;
  }
  let index = 0;
  return xml.replace(tagBlockPattern(tagName), (axisXml) => {
    const shouldPatch = index === targetIndex;
    index += 1;
    return shouldPatch ? patchAxisBlockXml(axisXml, style, fallbackColor) : axisXml;
  });
}

function patchChartAxisXml(xml: string, chartNode: PptxExportChartNode) {
  const style = chartNode.style;
  if (!style) {
    return xml;
  }
  let nextXml = xml;
  const fallbackColor = chartNode.themeTokens.dividerColor;
  if (style.xAxis) {
    const hasCatAxis = /<c:catAx\b/.test(nextXml);
    nextXml = patchNthAxisXml(nextXml, hasCatAxis ? "c:catAx" : "c:valAx", 0, style.xAxis, fallbackColor);
  }
  if (style.yAxis) {
    const valAxisIndex = chartNode.chartKind === "bubble" && !/<c:catAx\b/.test(nextXml) ? 1 : 0;
    nextXml = patchNthAxisXml(nextXml, "c:valAx", valAxisIndex, style.yAxis, fallbackColor);
  }
  if (style.secondaryYAxis) {
    nextXml = patchNthAxisXml(nextXml, "c:valAx", 1, style.secondaryYAxis, fallbackColor);
  }
  return nextXml;
}

function appendChartSpaceSpPr(xml: string, shadow: PptExportChartShadowStyle | null | undefined) {
  if (!shadow) {
    return xml;
  }
  const spPrXml = `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln>${buildChartShadowXml(shadow)}</c:spPr>`;
  if (/<c:chartSpace\b[\s\S]*?<\/c:chart>\s*<c:spPr\b/.test(xml)) {
    return xml.replace(/(<c:chartSpace\b[\s\S]*?<\/c:chart>\s*)<c:spPr\b[\s\S]*?<\/c:spPr>/, `$1${spPrXml}`);
  }
  return xml.replace(/(<\/c:chart>)/, `$1${spPrXml}`);
}

function appendPlotAreaSpPr(xml: string, shadow: PptExportChartShadowStyle | null | undefined) {
  if (!shadow) {
    return xml;
  }
  const spPrXml = `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln>${buildChartShadowXml(shadow)}</c:spPr>`;
  return patchFirstTagBlock(xml, "c:plotArea", (plotAreaXml) => {
    return plotAreaXml.replace(/<\/c:plotArea>/, `${spPrXml}</c:plotArea>`);
  });
}

export function patchNativeChartXml(xml: string, chartNode: PptxExportChartNode) {
  let nextXml = xml;
  nextXml = patchBubbleChartXml(nextXml, chartNode);
  nextXml = patchLineChartSeriesXml(nextXml, chartNode);
  nextXml = patchChartAxisXml(nextXml, chartNode);
  nextXml = appendPlotAreaSpPr(nextXml, chartNode.style?.plotShadow);
  nextXml = appendChartSpaceSpPr(nextXml, chartNode.style?.chartShadow);
  return nextXml;
}

export async function patchPptxPackageXml(args: {
  arrayBuffer: ArrayBuffer;
  document: PptxExportDocument;
}) {
  const patchEntries = args.document.slides
    .map((slide) => ({
      slide,
      shapes: slide.nodes.filter(
        (node): node is PptxExportShapeNode =>
          node.nodeType === "shape" &&
          (node.paint.type === "linearGradient" || node.shape === "freeform"),
      ),
      charts: nativeChartNodesInRenderOrder(slide).filter(chartNodeNeedsXmlPatch),
      hiddenChartCount: slide.nodes.filter(
        (node): node is PptxExportChartNode =>
          node.nodeType === "chart" && shouldHideNativeChartFrame(node),
      ).length,
    }))
    .filter((entry) => entry.shapes.length > 0 || entry.charts.length > 0 || entry.hiddenChartCount > 0);

  const zip = await JSZip.loadAsync(args.arrayBuffer);
  await patchPackageZeroSizeExtents(zip);
  await Promise.all(
    patchEntries.map(async ({ slide, shapes, charts, hiddenChartCount }) => {
      const slidePath = `ppt/slides/slide${slide.pageNumber}.xml`;
      const file = zip.file(slidePath);
      if (!file) {
        return;
      }
      const xml = await file.async("string");
      if (charts.length) {
        const relPath = `ppt/slides/_rels/slide${slide.pageNumber}.xml.rels`;
        const relationshipXml = await zip.file(relPath)?.async("string");
        const relationships = parsePptxRelationships(relationshipXml);
        const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
        const frameRelationshipIds = parseSlideChartFrameRelationshipIds(xml);
        const chartNodes = nativeChartNodesInRenderOrder(slide);
        await Promise.all(
          frameRelationshipIds.map(async (relationshipId, index) => {
            const chartNode = chartNodes[index];
            if (!chartNode || !chartNodeNeedsXmlPatch(chartNode)) {
              return;
            }
            const relationship = relationshipById.get(relationshipId);
            if (!relationship || !/\/chart$/i.test(relationship.type)) {
              return;
            }
            const chartPath = resolvePptxRelationshipTarget(relPath, relationship.target);
            if (!chartPath) {
              return;
            }
            const chartXml = await zip.file(chartPath)?.async("string");
            if (!chartXml) {
              return;
            }
            zip.file(chartPath, patchNativeChartXml(chartXml, chartNode));
          }),
        );
      }
      const patchedShapesXml = patchSlideNativeShapes(xml, shapes);
      zip.file(slidePath, patchHiddenNativeChartFrames(patchedShapesXml, hiddenChartCount));
    }),
  );

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

function pptxRelsSourcePartPath(relsPath: string) {
  if (relsPath === "_rels/.rels") {
    return "";
  }
  return relsPath.replace(/(^|\/)_rels\/([^/]+)\.rels$/i, "$1$2");
}

function normalizeZipPath(value: string) {
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

export function resolvePptxRelationshipTarget(relsPath: string, target: string) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return null;
  }
  if (target.startsWith("/")) {
    return normalizeZipPath(target.replace(/^\/+/, ""));
  }
  const sourcePart = pptxRelsSourcePartPath(relsPath);
  const sourceDir = sourcePart.includes("/") ? sourcePart.slice(0, sourcePart.lastIndexOf("/")) : "";
  return normalizeZipPath(`${sourceDir}/${target}`);
}

function parseXmlPackagePart(args: {
  parser: DOMParser;
  fileName: string;
  xml: string;
}): { document: XMLDocument | null; diagnostic: PptExportDiagnostic | null } {
  const parsed = args.parser.parseFromString(args.xml, "application/xml");
  const parseError = parsed.getElementsByTagName("parsererror")[0];
  if (!parseError) {
    return { document: parsed, diagnostic: null };
  }

  return {
    document: null,
    diagnostic: {
      code: "xml-package-invalid",
      severity: "fatal",
      countsAgainstQuality: true,
      sourceKind: "deck",
      sourceId: args.fileName,
      message: `PPTX package XML part ${args.fileName} is not well-formed.`,
    },
  };
}

export async function validatePptxPackageBlob(blob: Blob): Promise<PptExportDiagnostic[]> {
  const parser = new DOMParser();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const zipPaths = new Set(Object.keys(zip.files).filter((name) => !zip.files[name]?.dir));
  const diagnostics: PptExportDiagnostic[] = [];

  const xmlEntries = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir && /\.(?:xml|rels)$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  await Promise.all(
    xmlEntries.map(async (fileName) => {
      const xml = await zip.file(fileName)?.async("string");
      if (xml === undefined) {
        return;
      }
      const parsed = parseXmlPackagePart({
        parser,
        fileName,
        xml,
      });
      if (parsed.diagnostic) {
        diagnostics.push(parsed.diagnostic);
        return;
      }
      if (/^ppt\/charts\/chart\d+\.xml$/i.test(fileName)) {
        diagnostics.push({
          code: "powerpoint-repair-risk-xml",
          severity: "fatal",
          countsAgainstQuality: true,
          sourceKind: "deck",
          sourceId: fileName,
          message: `PPTX package contains native chart XML part ${fileName}; default chart export must use visual snapshots.`,
        });
      }
      const zeroExt = Array.from(xml.matchAll(/<a:ext\b([^>]*)\/>/g)).find((match) => {
        const attrs = match[1] ?? "";
        const cx = Number.parseInt(attrs.match(/\bcx="(-?\d+)"/)?.[1] ?? "1", 10);
        const cy = Number.parseInt(attrs.match(/\bcy="(-?\d+)"/)?.[1] ?? "1", 10);
        return cx <= 0 || cy <= 0;
      });
      if (zeroExt) {
        diagnostics.push({
          code: "zero-size-ext",
          severity: "fatal",
          countsAgainstQuality: true,
          sourceKind: "deck",
          sourceId: fileName,
          message: `PPTX package XML part ${fileName} contains a zero-size shape extent.`,
        });
      }
      if (!parsed.document || !/\.rels$/i.test(fileName)) {
        return;
      }

      const relationships = Array.from(parsed.document.getElementsByTagName("Relationship"));
      for (const relationship of relationships) {
        if (relationship.getAttribute("TargetMode") === "External") {
          continue;
        }
        const target = relationship.getAttribute("Target") ?? "";
        const resolvedTarget = resolvePptxRelationshipTarget(fileName, target);
        if (!resolvedTarget || zipPaths.has(resolvedTarget)) {
          continue;
        }
        diagnostics.push({
          code: "relationship-target-missing",
          severity: "fatal",
          countsAgainstQuality: true,
          sourceKind: "deck",
          sourceId: fileName,
          message: `PPTX relationship ${relationship.getAttribute("Id") ?? "(unknown)"} in ${fileName} points to missing part ${resolvedTarget}.`,
        });
      }
    }),
  );

  const svgMediaEntries = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir && /^ppt\/media\/.+\.svg$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  await Promise.all(
    svgMediaEntries.map(async (fileName) => {
      const svg = await zip.file(fileName)?.async("string");
      if (svg && /<foreignObject\b/i.test(svg)) {
        diagnostics.push({
          code: "powerpoint-repair-risk-xml",
          severity: "fatal",
          countsAgainstQuality: true,
          sourceKind: "deck",
          sourceId: fileName,
          message: `PPTX package contains foreignObject SVG snapshot asset ${fileName}; visual snapshots must be rasterized to PNG before packaging.`,
        });
      }
    }),
  );

  return diagnostics;
}
