import {
  PPT_LAYOUT,
  type PptExportPaint,
  type PptxExportChartNode,
  type PptxExportDocument,
  type PptxExportShapeNode,
  type PptxExportSlide,
  type PptxExportTableNode,
  type PptxExportTextNode,
} from "./types";

function textNodes(slide: PptxExportSlide) {
  return slide.nodes.filter((node): node is PptxExportTextNode => node.nodeType === "text");
}

function shapeNodes(slide: PptxExportSlide) {
  return slide.nodes.filter((node): node is PptxExportShapeNode => node.nodeType === "shape");
}

function chartNodes(slide: PptxExportSlide) {
  return slide.nodes.filter((node): node is PptxExportChartNode => node.nodeType === "chart");
}

function tableNodes(slide: PptxExportSlide) {
  return slide.nodes.filter((node): node is PptxExportTableNode => node.nodeType === "table");
}

function renderSlideBackground(slide: any, slideModel: PptxExportSlide) {
  slide.background = { color: slideModel.theme.backgroundColor };
  if (slideModel.theme.backgroundImageData) {
    slide.addImage({
      data: slideModel.theme.backgroundImageData,
      x: 0,
      y: 0,
      w: PPT_LAYOUT.widthInches,
      h: PPT_LAYOUT.heightInches,
    });
  }
}

function solidFillFromPaint(paint: PptExportPaint) {
  if (paint.type === "solid") {
    return {
      color: paint.color,
      transparency: paint.transparency ?? 0,
    };
  }
  if (paint.type === "linearGradient") {
    const firstStop = paint.stops[0];
    return {
      color: firstStop?.color ?? "FFFFFF",
      transparency: firstStop?.transparency ?? 0,
    };
  }
  return { color: "FFFFFF", transparency: 100 };
}

function shadowFromShapeNode(shapeNode: PptxExportShapeNode) {
  if (!shapeNode.shadow) {
    return undefined;
  }

  return {
    type: shapeNode.shadow.type,
    color: shapeNode.shadow.color,
    opacity: shapeNode.shadow.opacity,
    blur: shapeNode.shadow.blurPt,
    offset: shapeNode.shadow.offsetPt,
    angle: shapeNode.shadow.angle,
    rotateWithShape: false,
  };
}

function renderVisualNodes(pptx: any, slide: any, slideModel: PptxExportSlide) {
  for (const shapeNode of shapeNodes(slideModel)) {
    if (shapeNode.shape === "line") {
      const useExactLineVector = shapeNode.role.startsWith("svg-");
      const isVertical = Math.abs(shapeNode.h) > Math.abs(shapeNode.w);
      slide.addShape(pptx.ShapeType.line, {
        objectName: shapeNode.id,
        x: useExactLineVector ? shapeNode.x : isVertical ? shapeNode.x + shapeNode.w / 2 : shapeNode.x,
        y: useExactLineVector ? shapeNode.y : isVertical ? shapeNode.y : shapeNode.y + shapeNode.h / 2,
        w: useExactLineVector ? shapeNode.w : isVertical ? 0 : shapeNode.w,
        h: useExactLineVector ? shapeNode.h : isVertical ? shapeNode.h : 0,
        line: shapeNode.lineColor
          ? {
              color: shapeNode.lineColor,
              transparency: shapeNode.lineTransparency,
              width: shapeNode.lineWidthPt ?? 0.75,
              dashType: shapeNode.lineDash === "dash" ? "dash" : shapeNode.lineDash === "sysDot" ? "sysDot" : undefined,
            }
          : { color: "FFFFFF", transparency: 100, width: 0 },
        shadow: shadowFromShapeNode(shapeNode),
      });
      continue;
    }

    const shapeType =
      shapeNode.shape === "ellipse"
        ? pptx.ShapeType.ellipse
        : shapeNode.shape === "roundRect"
          ? pptx.ShapeType.roundRect
          : pptx.ShapeType.rect;

    slide.addShape(shapeType, {
      objectName: shapeNode.id,
      x: shapeNode.x,
      y: shapeNode.y,
      w: shapeNode.w,
      h: shapeNode.h,
      fill: solidFillFromPaint(shapeNode.paint),
      line: shapeNode.lineColor
        ? {
            color: shapeNode.lineColor,
            transparency: shapeNode.lineTransparency,
            width: shapeNode.lineWidthPt ?? 0.75,
            dashType:
              shapeNode.lineDash === "dash" ? "dash" : shapeNode.lineDash === "sysDot" ? "sysDot" : undefined,
          }
        : { color: "FFFFFF", transparency: 100, width: 0 },
      shadow: shadowFromShapeNode(shapeNode),
    });
  }
}

function formatChartValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return `${Math.round(value)}`;
  }
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(1);
}

function renderChartHeading(slide: any, chartNode: PptxExportChartNode) {
  let chartTop = chartNode.y;
  let chartHeight = chartNode.h;

  if (chartNode.showInlineHeading === false) {
    return {
      chartTop,
      chartHeight: Math.max(0.8, chartHeight),
    };
  }

  if (chartNode.title) {
    slide.addText(chartNode.title, {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: 0.34,
      fontFace: "Iowan Old Style",
      fontSize: 16,
      bold: true,
      margin: 0,
      color: chartNode.themeTokens.textPrimary,
    });
    chartTop += 0.4;
    chartHeight -= 0.4;
  }

  if (chartNode.subtitle) {
    slide.addText(chartNode.subtitle, {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: 0.3,
      fontFace: "Avenir Next",
      fontSize: 9,
      color: chartNode.themeTokens.textMuted,
      margin: 0,
    });
    chartTop += 0.36;
    chartHeight -= 0.36;
  }

  return {
    chartTop,
    chartHeight: Math.max(0.8, chartHeight),
  };
}

function resolveChartColors(chartNode: PptxExportChartNode) {
  const seriesColors = chartNode.series
    .map((series) => series.color)
    .filter((item): item is string => Boolean(item));
  if (seriesColors.length) {
    return seriesColors;
  }
  if (chartNode.colors.length) {
    return chartNode.colors;
  }
  if (chartNode.themeTokens.chartPalette.length) {
    return chartNode.themeTokens.chartPalette;
  }
  return [chartNode.themeTokens.accent];
}

function usesHtmlChartChrome(chartNode: PptxExportChartNode) {
  return chartNode.showInlineHeading === false;
}

function shouldHideNativeChartVisual(chartNode: PptxExportChartNode) {
  return (
    usesHtmlChartChrome(chartNode) &&
    (chartNode.chartKind === "waterfall" ||
      chartNode.chartKind === "bubble" ||
      chartNode.chartKind === "line")
  );
}

function chartFrameBounds(chartNode: PptxExportChartNode) {
  return chartNode.frameBounds ?? { x: chartNode.x, y: chartNode.y, w: chartNode.w, h: chartNode.h };
}

function addChartText(
  slide: any,
  text: string | undefined,
  options: {
    x: number;
    y: number;
    w: number;
    h: number;
    fontSize: number;
    color: string;
    bold?: boolean;
    align?: "left" | "center" | "right";
    rotate?: number;
    fontFace?: string;
  },
) {
  if (!text?.trim()) {
    return;
  }
  slide.addText(text, {
    x: options.x,
    y: options.y,
    w: Math.max(0.05, options.w),
    h: Math.max(0.05, options.h),
    fontFace: options.fontFace ?? "Avenir Next",
    fontSize: options.fontSize,
    color: options.color,
    bold: options.bold ?? false,
    align: options.align,
    rotate: options.rotate,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    line: { color: "FFFFFF", transparency: 100, width: 0 },
    fill: { color: "FFFFFF", transparency: 100, type: "none" },
  });
}

function renderSemanticChartHeading(slide: any, chartNode: PptxExportChartNode) {
  const frame = chartFrameBounds(chartNode);
  addChartText(slide, chartNode.title, {
    x: frame.x + 0.16,
    y: frame.y + 0.12,
    w: Math.max(0.4, frame.w - 0.32),
    h: 0.26,
    fontFace: "Iowan Old Style",
    fontSize: 12,
    bold: true,
    color: chartNode.themeTokens.textPrimary,
  });
  addChartText(slide, chartNode.subtitle || chartNode.insight, {
    x: frame.x + 0.16,
    y: frame.y + 0.42,
    w: Math.max(0.4, frame.w - 0.32),
    h: 0.22,
    fontSize: 7.5,
    color: chartNode.themeTokens.textMuted,
  });
}

function valueDomain(values: number[], explicitMin?: number, explicitMax?: number) {
  const finite = values.filter((value) => Number.isFinite(value));
  const rawMin = explicitMin ?? Math.min(0, ...finite);
  const rawMax = explicitMax ?? Math.max(1, ...finite);
  if (rawMin === rawMax) {
    const pad = Math.max(Math.abs(rawMin) * 0.12, 1);
    return { min: rawMin - pad, max: rawMax + pad };
  }
  const pad = explicitMin === undefined && explicitMax === undefined ? (rawMax - rawMin) * 0.08 : 0;
  return { min: rawMin - pad, max: rawMax + pad };
}

function mapValueToY(value: number, domain: { min: number; max: number }, plot: { y: number; h: number }) {
  return plot.y + ((domain.max - value) / Math.max(1e-6, domain.max - domain.min)) * plot.h;
}

function renderSemanticAxes(pptx: any, slide: any, chartNode: PptxExportChartNode, plot: { x: number; y: number; w: number; h: number }, domain: { min: number; max: number }) {
  const ticks = 4;
  for (let index = 0; index <= ticks; index += 1) {
    const ratio = index / ticks;
    const value = domain.min + ratio * (domain.max - domain.min);
    const y = plot.y + plot.h - ratio * plot.h;
    slide.addShape(pptx.ShapeType.line, {
      x: plot.x,
      y,
      w: plot.w,
      h: 0,
      line: { color: chartNode.themeTokens.dividerColor, transparency: index === 0 ? 0 : 25, width: index === 0 ? 1 : 0.6 },
    });
    addChartText(slide, formatChartValue(value), {
      x: plot.x - 0.42,
      y: y - 0.06,
      w: 0.34,
      h: 0.14,
      fontSize: 6.5,
      align: "right",
      color: chartNode.themeTokens.textMuted,
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: plot.x,
    y: plot.y,
    w: 0,
    h: plot.h,
    line: { color: chartNode.themeTokens.dividerColor, width: 0.9 },
  });
}

function semanticPlotBounds(chartNode: PptxExportChartNode) {
  return {
    x: chartNode.x + 0.38,
    y: chartNode.y + 0.14,
    w: Math.max(0.4, chartNode.w - 0.54),
    h: Math.max(0.42, chartNode.h - 0.5),
  };
}

function renderSemanticLineChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  const spec = chartNode.semanticSpec?.kind === "line" ? chartNode.semanticSpec : null;
  if (!spec?.series.length || !spec.labels.length) {
    return;
  }
  renderSemanticChartHeading(slide, chartNode);
  const plot = semanticPlotBounds(chartNode);
  const values = spec.series.flatMap((series) => series.values);
  const domain = valueDomain(values, spec.valueAxisMin, spec.valueAxisMax);
  renderSemanticAxes(pptx, slide, chartNode, plot, domain);
  const slot = spec.labels.length > 1 ? plot.w / (spec.labels.length - 1) : plot.w;
  spec.labels.forEach((label, index) => {
    const x = spec.labels.length > 1 ? plot.x + index * slot : plot.x + plot.w / 2;
    addChartText(slide, label, {
      x: x - 0.18,
      y: plot.y + plot.h + 0.12,
      w: 0.36,
      h: 0.16,
      fontSize: 6.5,
      align: "center",
      color: chartNode.themeTokens.textMuted,
    });
  });
  spec.series.forEach((series, seriesIndex) => {
    const color = series.color ?? chartNode.colors[seriesIndex] ?? chartNode.themeTokens.chartPalette[seriesIndex] ?? chartNode.themeTokens.accent;
    const points = spec.labels.map((_, index) => ({
      x: spec.labels.length > 1 ? plot.x + index * slot : plot.x + plot.w / 2,
      y: mapValueToY(series.values[index] ?? 0, domain, plot),
      value: series.values[index] ?? 0,
    }));
    points.slice(0, -1).forEach((point, index) => {
      const next = points[index + 1]!;
      slide.addShape(pptx.ShapeType.line, {
        x: point.x,
        y: point.y,
        w: next.x - point.x,
        h: next.y - point.y,
        line: { color, width: 1.6, dash: seriesIndex > 1 ? "dash" : undefined },
      });
    });
    points.forEach((point) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: point.x - 0.035,
        y: point.y - 0.035,
        w: 0.07,
        h: 0.07,
        fill: { color, transparency: 0 },
        line: { color: "FFFFFF", width: 0.75 },
      });
    });
  });
  if (spec.series.length > 1) {
    const frame = chartFrameBounds(chartNode);
    spec.series.forEach((series, index) => {
      const color = series.color ?? chartNode.colors[index] ?? chartNode.themeTokens.chartPalette[index] ?? chartNode.themeTokens.accent;
      const y = frame.y + 0.18 + index * 0.18;
      slide.addShape(pptx.ShapeType.line, {
        x: frame.x + frame.w - 1.45,
        y: y + 0.06,
        w: 0.18,
        h: 0,
        line: { color, width: 1.4, dash: index > 1 ? "dash" : undefined },
      });
      addChartText(slide, series.name, {
        x: frame.x + frame.w - 1.2,
        y,
        w: 1.0,
        h: 0.14,
        fontSize: 6.5,
        color: chartNode.themeTokens.textMuted,
      });
    });
  }
}

function renderSemanticWaterfallChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  const spec = chartNode.semanticSpec?.kind === "waterfall" ? chartNode.semanticSpec : null;
  if (!spec?.values.length || !spec.labels.length) {
    return;
  }
  renderSemanticChartHeading(slide, chartNode);
  const plot = semanticPlotBounds(chartNode);
  const totals = [0];
  let running = 0;
  spec.values.forEach((value, index) => {
    running = index === 0 || index === spec.values.length - 1 ? value : running + value;
    totals.push(running);
  });
  const domain = valueDomain(totals);
  renderSemanticAxes(pptx, slide, chartNode, plot, domain);
  const step = plot.w / Math.max(1, spec.values.length);
  const barW = Math.max(0.12, step * 0.52);
  let cumulative = 0;
  spec.values.forEach((value, index) => {
    const endpoint = index === 0 || index === spec.values.length - 1;
    const start = endpoint ? 0 : cumulative;
    const end = endpoint ? value : cumulative + value;
    const topValue = Math.max(start, end);
    const bottomValue = Math.min(start, end);
    const x = plot.x + index * step + (step - barW) / 2;
    const y = mapValueToY(topValue, domain, plot);
    const bottomY = mapValueToY(bottomValue, domain, plot);
    const color = endpoint
      ? chartNode.themeTokens.textPrimary
      : value >= 0
        ? spec.colors[0] ?? chartNode.themeTokens.chartPalette[0] ?? chartNode.themeTokens.accent
        : spec.colors[2] ?? chartNode.themeTokens.chartPalette[2] ?? chartNode.themeTokens.textMuted;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: barW,
      h: Math.max(0.04, bottomY - y),
      fill: { color, transparency: 0 },
      line: { color, width: 0.5 },
    });
    if (index > 0) {
      const connectorY = mapValueToY(cumulative, domain, plot);
      slide.addShape(pptx.ShapeType.line, {
        x: plot.x + (index - 1) * step + step / 2,
        y: connectorY,
        w: step,
        h: 0,
        line: { color: chartNode.themeTokens.dividerColor, width: 0.7, dash: "dash" },
      });
    }
    addChartText(slide, formatChartValue(value), {
      x: x - 0.04,
      y: Math.max(plot.y, y - 0.17),
      w: barW + 0.08,
      h: 0.14,
      fontSize: 6.5,
      align: "center",
      bold: true,
      color: chartNode.themeTokens.textMuted,
    });
    addChartText(slide, spec.labels[index], {
      x: x - 0.08,
      y: plot.y + plot.h + 0.12,
      w: barW + 0.16,
      h: 0.18,
      fontSize: 6.3,
      align: "center",
      color: chartNode.themeTokens.textMuted,
    });
    cumulative = end;
  });
}

function renderSemanticBubbleChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  const spec = chartNode.semanticSpec?.kind === "bubble" ? chartNode.semanticSpec : null;
  if (!spec?.points.length) {
    return;
  }
  renderSemanticChartHeading(slide, chartNode);
  const plot = semanticPlotBounds(chartNode);
  const xDomain = valueDomain(spec.points.map((point) => point.x));
  const yDomain = valueDomain(spec.points.map((point) => point.y));
  renderSemanticAxes(pptx, slide, chartNode, plot, yDomain);
  const sizeMax = Math.max(1, ...spec.points.map((point) => point.size));
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const x = plot.x + ratio * plot.w;
    const label = xDomain.min + ratio * (xDomain.max - xDomain.min);
    slide.addShape(pptx.ShapeType.line, {
      x,
      y: plot.y,
      w: 0,
      h: plot.h,
      line: { color: chartNode.themeTokens.dividerColor, transparency: 55, width: 0.5 },
    });
    addChartText(slide, formatChartValue(label), {
      x: x - 0.16,
      y: plot.y + plot.h + 0.12,
      w: 0.32,
      h: 0.14,
      fontSize: 6.2,
      align: "center",
      color: chartNode.themeTokens.textMuted,
    });
  }
  spec.points.forEach((point, index) => {
    const x = xDomain.max === xDomain.min ? plot.x + plot.w / 2 : plot.x + ((point.x - xDomain.min) / (xDomain.max - xDomain.min)) * plot.w;
    const y = mapValueToY(point.y, yDomain, plot);
    const radius = 0.08 + (point.size / sizeMax) * 0.22;
    const color = point.color ?? chartNode.themeTokens.chartPalette[index] ?? chartNode.themeTokens.accent;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x - radius,
      y: y - radius,
      w: radius * 2,
      h: radius * 2,
      fill: { color, transparency: 16 },
      line: { color: "FFFFFF", transparency: 8, width: 1 },
    });
    addChartText(slide, point.label, {
      x: Math.min(plot.x + plot.w - 0.72, x + radius + 0.06),
      y: y - 0.08,
      w: 0.7,
      h: 0.16,
      fontSize: 6.4,
      bold: true,
      color: chartNode.themeTokens.textPrimary,
    });
  });
  addChartText(slide, spec.xAxisTitle, {
    x: plot.x,
    y: plot.y + plot.h + 0.34,
    w: plot.w,
    h: 0.16,
    fontSize: 6.8,
    align: "center",
    color: chartNode.themeTokens.textMuted,
  });
  addChartText(slide, spec.yAxisTitle, {
    x: plot.x - 0.72,
    y: plot.y + plot.h / 2 - 0.1,
    w: 0.5,
    h: 0.16,
    fontSize: 6.8,
    align: "center",
    rotate: 270,
    color: chartNode.themeTokens.textMuted,
  });
}

function normalizeRectWithin(bounds: { x: number; y: number; w: number; h: number }, container: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(container.x, Math.min(container.x + container.w, bounds.x));
  const y = Math.max(container.y, Math.min(container.y + container.h, bounds.y));
  const right = Math.max(x, Math.min(container.x + container.w, bounds.x + bounds.w));
  const bottom = Math.max(y, Math.min(container.y + container.h, bounds.y + bounds.h));
  return { x, y, w: right - x, h: bottom - y };
}

function renderSemanticMatrixChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  const spec = chartNode.semanticSpec?.kind === "matrix" ? chartNode.semanticSpec : null;
  if (!spec?.items.length) {
    return;
  }
  renderSemanticChartHeading(slide, chartNode);
  const frame = chartFrameBounds(chartNode);
  const defaultPlot = {
    x: frame.x + 0.52,
    y: frame.y + 0.72,
    w: Math.max(0.6, frame.w - 0.84),
    h: Math.max(0.5, frame.h - 1.12),
  };
  const plot = spec.plotBounds
    ? normalizeRectWithin(
        {
          x: frame.x + spec.plotBounds.x * frame.w,
          y: frame.y + spec.plotBounds.y * frame.h,
          w: spec.plotBounds.w * frame.w,
          h: spec.plotBounds.h * frame.h,
        },
        frame,
      )
    : defaultPlot;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: plot.x,
    y: plot.y,
    w: plot.w,
    h: plot.h,
    rectRadius: 0.08,
    fill: { color: chartNode.themeTokens.surfaceFill, transparency: 22 },
    line: { color: chartNode.themeTokens.dividerColor, transparency: 10, width: 0.8 },
  });
  (spec.quadrants ?? []).forEach((quadrant) => {
    const rect = normalizeRectWithin(
      {
        x: plot.x + quadrant.x * plot.w,
        y: plot.y + quadrant.y * plot.h,
        w: quadrant.w * plot.w,
        h: quadrant.h * plot.h,
      },
      plot,
    );
    if (rect.w <= 0 || rect.h <= 0) {
      return;
    }
    slide.addShape(pptx.ShapeType.rect, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      fill: { color: quadrant.color ?? chartNode.themeTokens.surfaceSecondary, transparency: 35 },
      line: { color: "FFFFFF", transparency: 100, width: 0 },
    });
  });
  slide.addShape(pptx.ShapeType.line, {
    x: plot.x + plot.w / 2,
    y: plot.y,
    w: 0,
    h: plot.h,
    line: { color: chartNode.themeTokens.dividerColor, transparency: 12, width: 1 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: plot.x,
    y: plot.y + plot.h / 2,
    w: plot.w,
    h: 0,
    line: { color: chartNode.themeTokens.dividerColor, transparency: 12, width: 1 },
  });
  spec.items.forEach((item, index) => {
    const rect = normalizeRectWithin(
      {
        x: plot.x + item.x * plot.w,
        y: plot.y + item.y * plot.h,
        w: Math.max(0.32, item.w * plot.w),
        h: Math.max(0.24, item.h * plot.h),
      },
      plot,
    );
    if (rect.w <= 0.08 || rect.h <= 0.08) {
      return;
    }
    slide.addShape(pptx.ShapeType.roundRect, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      fill: { color: item.color ?? chartNode.themeTokens.chartPalette[index] ?? chartNode.themeTokens.surfaceFill, transparency: 6 },
      line: { color: "FFFFFF", transparency: 12, width: 0.8 },
    });
    addChartText(slide, item.label, {
      x: rect.x + 0.08,
      y: rect.y + 0.07,
      w: Math.max(0.1, rect.w - 0.16),
      h: Math.min(0.22, rect.h * 0.42),
      fontSize: 7.2,
      bold: true,
      color: item.textColor ?? chartNode.themeTokens.textPrimary,
    });
    addChartText(slide, item.detail, {
      x: rect.x + 0.08,
      y: rect.y + 0.27,
      w: Math.max(0.1, rect.w - 0.16),
      h: Math.max(0.12, rect.h - 0.32),
      fontSize: 6.1,
      color: item.textColor ?? chartNode.themeTokens.textMuted,
    });
  });
  addChartText(slide, spec.xMinLabel, {
    x: plot.x,
    y: plot.y + plot.h + 0.08,
    w: Math.min(0.9, plot.w / 2),
    h: 0.14,
    fontSize: 6.5,
    color: chartNode.themeTokens.textMuted,
  });
  addChartText(slide, spec.xMaxLabel, {
    x: plot.x + plot.w - Math.min(0.9, plot.w / 2),
    y: plot.y + plot.h + 0.08,
    w: Math.min(0.9, plot.w / 2),
    h: 0.14,
    fontSize: 6.5,
    align: "right",
    color: chartNode.themeTokens.textMuted,
  });
  addChartText(slide, spec.xLabel, {
    x: plot.x,
    y: plot.y + plot.h + 0.28,
    w: plot.w,
    h: 0.16,
    fontSize: 6.8,
    align: "center",
    color: chartNode.themeTokens.textMuted,
  });
  addChartText(slide, spec.yMaxLabel, {
    x: Math.max(frame.x, plot.x - 0.42),
    y: plot.y,
    w: 0.36,
    h: 0.14,
    fontSize: 6.4,
    align: "right",
    color: chartNode.themeTokens.textMuted,
  });
  addChartText(slide, spec.yMinLabel, {
    x: Math.max(frame.x, plot.x - 0.42),
    y: plot.y + plot.h - 0.14,
    w: 0.36,
    h: 0.14,
    fontSize: 6.4,
    align: "right",
    color: chartNode.themeTokens.textMuted,
  });
  addChartText(slide, spec.yLabel, {
    x: Math.max(frame.x, plot.x - 0.68),
    y: plot.y + plot.h / 2 - 0.1,
    w: 0.48,
    h: 0.16,
    fontSize: 6.8,
    align: "center",
    rotate: 270,
    color: chartNode.themeTokens.textMuted,
  });
  if (spec.callout) {
    const rect = normalizeRectWithin(
      {
        x: frame.x + spec.callout.x * frame.w,
        y: frame.y + spec.callout.y * frame.h,
        w: spec.callout.w * frame.w,
        h: spec.callout.h * frame.h,
      },
      frame,
    );
    if (rect.w > 0.12 && rect.h > 0.12) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        fill: { color: spec.callout.color ?? chartNode.themeTokens.surfaceFill, transparency: 4 },
        line: { color: spec.callout.borderColor ?? chartNode.themeTokens.dividerColor, transparency: 10, width: 0.8 },
      });
      addChartText(slide, spec.callout.title, {
        x: rect.x + 0.08,
        y: rect.y + 0.07,
        w: Math.max(0.1, rect.w - 0.16),
        h: 0.18,
        fontSize: 7,
        bold: true,
        color: spec.callout.textColor ?? chartNode.themeTokens.textPrimary,
      });
      addChartText(slide, spec.callout.body, {
        x: rect.x + 0.08,
        y: rect.y + 0.27,
        w: Math.max(0.1, rect.w - 0.16),
        h: Math.max(0.1, rect.h - 0.32),
        fontSize: 6,
        color: spec.callout.textColor ?? chartNode.themeTokens.textMuted,
      });
    }
  }
}

function renderSemanticChartNodes(pptx: any, slide: any, slideModel: PptxExportSlide) {
  for (const chartNode of chartNodes(slideModel)) {
    switch (chartNode.semanticSpec?.kind) {
      case "line":
        renderSemanticLineChart(pptx, slide, chartNode);
        break;
      case "waterfall":
        renderSemanticWaterfallChart(pptx, slide, chartNode);
        break;
      case "bubble":
        renderSemanticBubbleChart(pptx, slide, chartNode);
        break;
      case "matrix":
        renderSemanticMatrixChart(pptx, slide, chartNode);
        break;
      default:
        break;
    }
  }
}

function transparentChartSurfaceOptions() {
  return {
    chartArea: {
      fill: { color: "FFFFFF", transparency: 100 },
      border: { color: "FFFFFF", transparency: 100, pt: 0 },
      roundedCorners: false,
    },
    plotArea: {
      fill: { color: "FFFFFF", transparency: 100 },
      border: { color: "FFFFFF", transparency: 100, pt: 0 },
    },
  };
}

function toChartData(chartNode: PptxExportChartNode, seriesGroup = chartNode.series) {
  return seriesGroup.map((series, index) => ({
    name: series.name || `Series ${index + 1}`,
    labels: chartNode.labels,
    values: series.values,
  }));
}

function resolveValueDomain(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return { min: min - pad, max: max + pad };
  }

  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function toBubbleChartData(chartNode: PptxExportChartNode) {
  const points = chartNode.bubblePoints ?? [];
  const groupedSeries = points.map((point, index) => {
    const values = Array.from({ length: points.length }, () => undefined as number | undefined);
    const sizes = Array.from({ length: points.length }, () => undefined as number | undefined);
    values[index] = point.y;
    sizes[index] = point.size;
    return {
      name: point.label || point.group || chartNode.sizeAxisTitle || `Bubble ${index + 1}`,
      color: point.color,
      values,
      sizes,
    };
  });
  const colors = groupedSeries
    .map((series) => series.color)
    .filter((item): item is string => Boolean(item));

  return {
    data: [
      {
        name: chartNode.xAxisTitle || "X",
        values: points.map((point) => point.x),
      },
      ...groupedSeries.map((series) => ({
        name: series.name,
        values: series.values,
        sizes: series.sizes,
      })),
    ],
    colors,
    xDomain: resolveValueDomain(points.map((point) => point.x)),
    yDomain: resolveValueDomain(points.map((point) => point.y)),
    seriesCount: groupedSeries.length,
  };
}

function toWaterfallChartData(chartNode: PptxExportChartNode) {
  const values = chartNode.series[0]?.values ?? [];
  const labels = chartNode.labels.slice(0, values.length);
  const base: number[] = [];
  const increase: number[] = [];
  const decrease: number[] = [];
  let running = 0;

  values.forEach((value, index) => {
    const isEndpoint = index === 0 || index === values.length - 1;
    if (isEndpoint) {
      base.push(0);
      increase.push(Math.max(0, value));
      decrease.push(Math.max(0, -value));
      if (index === 0) {
        running = value;
      }
      return;
    }

    const next = running + value;
    if (value >= 0) {
      base.push(running);
      increase.push(value);
      decrease.push(0);
    } else {
      base.push(next);
      increase.push(0);
      decrease.push(Math.abs(value));
    }
    running = next;
  });

  return [
    {
      name: "Base",
      labels,
      values: base,
    },
    {
      name: "Increase",
      labels,
      values: increase,
    },
    {
      name: "Decrease",
      labels,
      values: decrease,
    },
  ];
}

function renderNativeWaterfallChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  const values = chartNode.series[0]?.values ?? [];
  if (values.length < 2 || chartNode.labels.length < 2) {
    return false;
  }

  const { chartTop, chartHeight } = renderChartHeading(slide, chartNode);
  const hideNativeVisual = shouldHideNativeChartVisual(chartNode);
  const positiveColor =
    chartNode.series[0]?.color ?? chartNode.themeTokens.chartPalette[0] ?? chartNode.themeTokens.accent;
  const negativeColor = chartNode.themeTokens.chartPalette[2] ?? chartNode.themeTokens.textMuted;
  const totals = [0];
  let runningTotal = 0;
  values.forEach((value, index) => {
    runningTotal = index === 0 || index === values.length - 1 ? value : runningTotal + value;
    totals.push(runningTotal);
  });

  slide.addChart(pptx.ChartType.bar, toWaterfallChartData(chartNode), {
    x: chartNode.x,
    y: chartTop,
    w: chartNode.w,
    h: chartHeight,
    showLegend: false,
    showTitle: false,
    showValue: false,
    chartColors: ["transparent", positiveColor, negativeColor],
    chartColorsOpacity: hideNativeVisual ? 0 : 100,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: chartNode.themeTokens.textMuted,
    valAxisLabelColor: chartNode.themeTokens.textMuted,
    catAxisHidden: hideNativeVisual,
    valAxisHidden: hideNativeVisual,
    catAxisLabelPos: hideNativeVisual ? "none" : "nextTo",
    valAxisLabelPos: hideNativeVisual ? "none" : "nextTo",
    valAxisMinVal: Math.min(0, ...totals),
    valAxisMaxVal: Math.max(1, ...totals),
    catAxisLineShow: !hideNativeVisual,
    catAxisLineColor: chartNode.themeTokens.dividerColor,
    valAxisLineShow: !hideNativeVisual,
    valAxisLineColor: chartNode.themeTokens.dividerColor,
    valGridLine: hideNativeVisual
      ? { color: "FFFFFF", size: 0, style: "none" }
      : { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
    catGridLine: { color: "FFFFFF", size: 0, style: "none" },
    ...transparentChartSurfaceOptions(),
    barDir: "col",
    barGrouping: "stacked",
    showSerName: false,
    showPercent: false,
    showLeaderLines: false,
    dataLabelPosition: "outEnd",
  });

  return true;
}

function renderNativeBubbleChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  if (!chartNode.bubblePoints?.length) {
    return false;
  }

  const { chartTop, chartHeight } = renderChartHeading(slide, chartNode);
  const bubbleData = toBubbleChartData(chartNode);
  const chartColors = bubbleData.colors.length ? bubbleData.colors : resolveChartColors(chartNode);
  const hideNativeVisual = shouldHideNativeChartVisual(chartNode);

  slide.addChart(pptx.ChartType.bubble, bubbleData.data, {
    x: chartNode.x,
    y: chartTop,
    w: chartNode.w,
    h: chartHeight,
    showLegend: false,
    showTitle: false,
    showValue: false,
    showSerName: !hideNativeVisual,
    showPercent: false,
    showLeaderLines: false,
    chartColors,
    chartColorsOpacity: hideNativeVisual ? 0 : 80,
    dataLabelColor: chartNode.themeTokens.textPrimary,
    dataLabelFontBold: true,
    dataLabelFontFace: "Avenir Next",
    dataLabelFontSize: 8,
    showCatAxisTitle: Boolean(chartNode.xAxisTitle),
    showValAxisTitle: Boolean(chartNode.yAxisTitle),
    catAxisTitle: chartNode.xAxisTitle,
    valAxisTitle: chartNode.yAxisTitle,
    catAxisMinVal: bubbleData.xDomain.min,
    catAxisMaxVal: bubbleData.xDomain.max,
    valAxisMinVal: bubbleData.yDomain.min,
    valAxisMaxVal: bubbleData.yDomain.max,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: chartNode.themeTokens.textMuted,
    valAxisLabelColor: chartNode.themeTokens.textMuted,
    catAxisHidden: hideNativeVisual,
    valAxisHidden: hideNativeVisual,
    catAxisLabelPos: hideNativeVisual ? "none" : "nextTo",
    valAxisLabelPos: hideNativeVisual ? "none" : "nextTo",
    catAxisLineShow: !hideNativeVisual,
    catAxisLineColor: chartNode.themeTokens.dividerColor,
    valAxisLineShow: !hideNativeVisual,
    valAxisLineColor: chartNode.themeTokens.dividerColor,
    valGridLine: hideNativeVisual
      ? { color: "FFFFFF", size: 0, style: "none" }
      : { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
    catGridLine: hideNativeVisual
      ? { color: "FFFFFF", size: 0, style: "none" }
      : { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
    ...transparentChartSurfaceOptions(),
    legendPos: "b",
    dataLabelPosition: "r",
  });

  return true;
}

function renderNativeComboChart(pptx: any, slide: any, chartNode: PptxExportChartNode) {
  const barSeries = chartNode.series.filter((series) => (series.role ?? "bar") === "bar");
  const lineSeries = chartNode.series.filter((series) => (series.role ?? "bar") === "line");
  if (!barSeries.length || !lineSeries.length) {
    return false;
  }

  const { chartTop, chartHeight } = renderChartHeading(slide, chartNode);
  const fallbackColors = resolveChartColors(chartNode);
  const usesSecondaryAxis = lineSeries.some((series) => series.axis === "secondary");
  const colorsFor = (seriesGroup: typeof chartNode.series) => {
    const colors = seriesGroup
      .map((series) => series.color)
      .filter((item): item is string => Boolean(item));
    return colors.length ? colors : fallbackColors;
  };

  slide.addChart(
    [
      {
        type: pptx.ChartType.bar,
        data: toChartData(chartNode, barSeries),
        options: {
          barDir: "col",
          barGrouping: "clustered",
          chartColors: colorsFor(barSeries),
          dataLabelPosition: "outEnd",
          showValue: false,
        },
      },
      {
        type: pptx.ChartType.line,
        data: toChartData(chartNode, lineSeries),
        options: {
          chartColors: colorsFor(lineSeries),
          dataLabelPosition: "t",
          lineSize: 2.8,
          secondaryValAxis: usesSecondaryAxis,
          showValue: false,
        },
      },
    ],
    {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: chartHeight,
      showLegend: true,
      showTitle: false,
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 8,
      catAxisLabelColor: chartNode.themeTokens.textMuted,
      valAxisLabelColor: chartNode.themeTokens.textMuted,
      catAxisLabelPos: "nextTo",
      valAxisLabelPos: "nextTo",
      valAxisMinVal: chartNode.valueAxisMin,
      valAxisMaxVal: chartNode.valueAxisMax,
      catAxisLineShow: true,
      catAxisLineColor: chartNode.themeTokens.dividerColor,
      valAxisLineShow: true,
      valAxisLineColor: chartNode.themeTokens.dividerColor,
      valGridLine: { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
      catGridLine: { color: "FFFFFF", size: 0, style: "none" },
      showSerName: false,
      showPercent: false,
      showLeaderLines: false,
      legendPos: "b",
      valAxes: [
        {
          showValAxisTitle: Boolean(chartNode.yAxisTitle),
          valAxisTitle: chartNode.yAxisTitle,
          valAxisLabelColor: chartNode.themeTokens.textMuted,
          valGridLine: { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
        },
        ...(usesSecondaryAxis
          ? [
              {
                showValAxisTitle: Boolean(chartNode.secondaryYAxisTitle),
                valAxisTitle: chartNode.secondaryYAxisTitle,
                valAxisLabelColor: chartNode.themeTokens.textMuted,
                valGridLine: { style: "none" },
              },
            ]
          : []),
      ],
    },
  );

  return true;
}

function renderChartNodes(
  pptx: any,
  slide: any,
  slideModel: PptxExportSlide,
  shouldRenderChart: (chartNode: PptxExportChartNode) => boolean = () => true,
) {
  for (const chartNode of chartNodes(slideModel)) {
    if (!shouldRenderChart(chartNode)) {
      continue;
    }

    if (chartNode.renderMode !== "native") {
      continue;
    }

    if (chartNode.chartKind === "matrix") {
      continue;
    }

    if (chartNode.renderMode === "native" && chartNode.chartKind === "combo") {
      if (renderNativeComboChart(pptx, slide, chartNode)) {
        continue;
      }
    }

    if (chartNode.renderMode === "native" && chartNode.chartKind === "waterfall") {
      if (renderNativeWaterfallChart(pptx, slide, chartNode)) {
        continue;
      }
    }

    if (chartNode.renderMode === "native" && chartNode.chartKind === "bubble") {
      if (renderNativeBubbleChart(pptx, slide, chartNode)) {
        continue;
      }
    }

    const { chartTop, chartHeight } = renderChartHeading(slide, chartNode);
    const chartType = chartNode.chartKind === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
    const htmlChrome = usesHtmlChartChrome(chartNode);
    const hideNativeVisual = shouldHideNativeChartVisual(chartNode);

    slide.addChart(chartType, toChartData(chartNode), {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: chartHeight,
      showLegend: !htmlChrome && chartNode.series.length > 1,
      showTitle: false,
      catAxisLabelFontSize: htmlChrome ? 7 : 9,
      valAxisLabelFontSize: htmlChrome ? 7 : 8,
      showValue: false,
      chartColors: resolveChartColors(chartNode),
      chartColorsOpacity: hideNativeVisual ? 0 : 100,
      showValAxisTitle: Boolean(chartNode.yAxisTitle),
      showCatAxisTitle: Boolean(chartNode.xAxisTitle),
      valAxisTitle: chartNode.yAxisTitle,
      catAxisTitle: chartNode.xAxisTitle,
      catAxisLabelColor: chartNode.themeTokens.textMuted,
      valAxisLabelColor: chartNode.themeTokens.textMuted,
      catAxisLabelPos: htmlChrome || hideNativeVisual ? "none" : "nextTo",
      valAxisLabelPos: htmlChrome || hideNativeVisual ? "none" : "nextTo",
      valAxisMinVal: chartNode.valueAxisMin,
      valAxisMaxVal: chartNode.valueAxisMax,
      catAxisLineShow: !htmlChrome && !hideNativeVisual,
      catAxisLineColor: chartNode.themeTokens.dividerColor,
      valAxisLineShow: !htmlChrome && !hideNativeVisual,
      valAxisLineColor: chartNode.themeTokens.dividerColor,
      valGridLine: htmlChrome || hideNativeVisual
        ? { color: "FFFFFF", size: 0, style: "none" }
        : { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
      catGridLine: { color: "FFFFFF", size: 0, style: "none" },
      ...transparentChartSurfaceOptions(),
      showSerName: false,
      showPercent: false,
      showLeaderLines: false,
      legendPos: "b",
      dataLabelPosition: "outEnd",
      barDir: "col",
      lineSize: chartNode.chartKind === "line" ? 2.8 : undefined,
      barGrouping: chartNode.chartKind === "stacked" ? "stacked" : "clustered",
    });
  }
}

function renderTableNodes(slide: any, slideModel: PptxExportSlide) {
  for (const tableNode of tableNodes(slideModel)) {
    if (tableNode.renderMode !== "native") {
      continue;
    }

    if (!tableNode.rows.length) {
      continue;
    }

    slide.addTable(tableNode.rows, {
      x: tableNode.x,
      y: tableNode.y,
      w: tableNode.w,
      h: tableNode.h,
      border: { color: tableNode.themeTokens.dividerColor, pt: 0.6 },
      margin: 0.04,
      fontFace: "Avenir Next",
      fontSize: 8,
      color: tableNode.themeTokens.textPrimary,
      fill: { color: tableNode.themeTokens.surfaceFill },
    });
  }
}

function renderTextNodes(slide: any, slideModel: PptxExportSlide) {
  for (const textNode of textNodes(slideModel)) {
    const baseOptions = {
      x: textNode.x,
      y: textNode.y,
      w: textNode.w,
      h: textNode.h,
      fontFace: textNode.fontFamily || "Avenir Next",
      fontSize: textNode.fontSize,
      bold: textNode.bold ?? false,
      italic: textNode.italic ?? false,
      color: textNode.color,
      align: textNode.align,
      valign: textNode.valign ?? ("top" as const),
      rotate: textNode.rotate,
      margin: 0,
      breakLine: false,
      lineSpacingMultiple: textNode.lineSpacingMultiple,
      paraSpaceAfter: textNode.paraSpaceAfterPt,
      paraSpaceBefore: textNode.paraSpaceBeforePt,
      fill: textNode.fillColor
        ? { color: textNode.fillColor, transparency: 0, type: "solid" }
        : { color: "FFFFFF", transparency: 100, type: "none" },
      line: { color: "FFFFFF", transparency: 100, width: 0 },
    };

    if (textNode.items?.length) {
      const bullet =
        textNode.listStyle?.kind === "number"
          ? {
              type: "number",
              style: "arabicPeriod",
              numberStartAt: textNode.listStyle.numberStartAt ?? 1,
              indent: textNode.listStyle.indentPt ?? 18,
            }
          : {
              characterCode: "2022",
              indent: textNode.listStyle?.indentPt ?? 18,
            };
      slide.addText(
        textNode.items.map((item) => ({
          text: item,
          options: {
            bullet,
          },
        })),
        baseOptions,
      );
      continue;
    }

    slide.addText(textNode.text, baseOptions);
  }
}

function renderSlideToPptx(args: {
  pptx: any;
  slideModel: PptxExportSlide;
}) {
  const slide = args.pptx.addSlide();
  renderSlideBackground(slide, args.slideModel);
  renderChartNodes(args.pptx, slide, args.slideModel, shouldHideNativeChartVisual);
  renderVisualNodes(args.pptx, slide, args.slideModel);
  renderSemanticChartNodes(args.pptx, slide, args.slideModel);
  renderChartNodes(
    args.pptx,
    slide,
    args.slideModel,
    (chartNode) => !shouldHideNativeChartVisual(chartNode),
  );
  renderTableNodes(slide, args.slideModel);
  renderTextNodes(slide, args.slideModel);
}

export function renderExportDocumentToPptx(args: {
  pptx: any;
  document: PptxExportDocument;
}) {
  for (const slideModel of args.document.slides) {
    renderSlideToPptx({
      pptx: args.pptx,
      slideModel,
    });
  }
}
