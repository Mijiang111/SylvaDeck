import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const EMU_PER_INCH = 914400;

function decodeXmlEntities(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseRelationships(xml) {
  if (!xml) {
    return [];
  }
  return Array.from(xml.matchAll(/<Relationship\b([^>]*)\/?>/g)).map((match) => {
    const attrs = match[1] ?? "";
    const readAttr = (name) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
    return {
      id: readAttr("Id"),
      type: readAttr("Type"),
      target: readAttr("Target"),
    };
  });
}

function countMatches(xml, pattern) {
  return Array.from(xml.matchAll(pattern)).length;
}

function emuToInches(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / EMU_PER_INCH : 0;
}

function parseChartFrameBounds(xml) {
  return Array.from(xml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g))
    .map((match) => match[0] ?? "")
    .filter((frameXml) => /<c:chart\b|\/chart/i.test(frameXml))
    .map((frameXml) => {
      const off = frameXml.match(/<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/i);
      const ext = frameXml.match(/<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i);
      return {
        x: emuToInches(off?.[1]),
        y: emuToInches(off?.[2]),
        w: emuToInches(ext?.[1]),
        h: emuToInches(ext?.[2]),
      };
    });
}

function parseShapeText(shapeXml) {
  return Array.from(shapeXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
    .map((match) => decodeXmlEntities(match[1] ?? ""))
    .join(" ");
}

function parseShapeFill(shapeXml) {
  if (/<a:noFill\s*\/>/i.test(shapeXml)) {
    return {
      fillType: "none",
      fillColor: "",
      fillTransparency: 100,
    };
  }

  if (/<a:gradFill\b/i.test(shapeXml)) {
    return {
      fillType: "gradient",
      fillColor: "",
      fillTransparency: 0,
    };
  }

  const solidFill = shapeXml.match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/i)?.[0] ?? "";
  const color = solidFill.match(/<a:srgbClr\b[^>]*val="([^"]*)"/i)?.[1] ?? "";
  const alphaRaw = solidFill.match(/<a:alpha\b[^>]*val="(\d+)"/i)?.[1];
  const alpha = alphaRaw ? Number(alphaRaw) : 100000;
  if (!color) {
    return {
      fillType: "unknown",
      fillColor: "",
      fillTransparency: 100,
    };
  }

  return {
    fillType: "solid",
    fillColor: color.toUpperCase(),
    fillTransparency: Number.isFinite(alpha) ? Math.round(100 - alpha / 1000) : 0,
  };
}

function parseShapeBounds(xml) {
  return Array.from(xml.matchAll(/<p:(sp|cxnSp)\b[\s\S]*?<\/p:\1>/g)).map((match, index) => {
    const shapeXml = match[0] ?? "";
    const off = shapeXml.match(/<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/i);
    const ext = shapeXml.match(/<a:ext\b[^>]*cx="(-?\d+)"[^>]*cy="(-?\d+)"/i);
    const name = shapeXml.match(/<p:cNvPr\b[^>]*name="([^"]*)"/i)?.[1] ?? "";
    const preset = shapeXml.match(/<a:prstGeom\b[^>]*prst="([^"]*)"/i)?.[1] ?? "";
    const fill = parseShapeFill(shapeXml);
    return {
      order: index + 1,
      kind: match[1] ?? "sp",
      name,
      preset,
      x: emuToInches(off?.[1]),
      y: emuToInches(off?.[2]),
      w: emuToInches(ext?.[1]),
      h: emuToInches(ext?.[2]),
      text: parseShapeText(shapeXml),
      ...fill,
    };
  });
}

function resolveRelationshipTarget(slideName, target) {
  if (!target || target.startsWith("/")) {
    return target.replace(/^\/+/, "");
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(slideName), target));
}

function inspectChartXml(xml) {
  const bubbleChartBlocks = Array.from(xml.matchAll(/<c:bubbleChart\b[\s\S]*?<\/c:bubbleChart>/g)).map(
    (match) => match[0] ?? "",
  );
  return {
    barChartCount: countMatches(xml, /<c:barChart\b/g),
    lineChartCount: countMatches(xml, /<c:lineChart\b/g),
    bubbleChartCount: countMatches(xml, /<c:bubbleChart\b/g),
    scatterChartCount: countMatches(xml, /<c:scatterChart\b/g),
    axisMinCount: countMatches(xml, /<c:min\b/g),
    axisMaxCount: countMatches(xml, /<c:max\b/g),
    chartDashCount: countMatches(xml, /<a:prstDash\b[^>]*val="(?:dash|dot)"/g),
    chartOuterShadowCount: countMatches(xml, /<a:outerShdw\b/g),
    chartBubbleScaleCount: countMatches(xml, /<c:bubbleScale\b/g),
    chartDataPointCount: countMatches(xml, /<c:dPt\b/g),
    chartEmptyValueCount: countMatches(xml, /<c:v>\s*<\/c:v>/g),
    bubbleSeriesCount: bubbleChartBlocks.reduce(
      (sum, block) => sum + countMatches(block, /<c:ser\b/g),
      0,
    ),
  };
}

function inspectSlideXml(xml, relationships, chartXmlEntries) {
  const imageRelCount = relationships.filter((entry) => /\/image$/i.test(entry.type)).length;
  const chartRelCount = relationships.filter((entry) => /\/chart$/i.test(entry.type)).length;
  const chartCounts = chartXmlEntries.reduce(
    (accumulator, entry) => {
      const counts = inspectChartXml(entry.xml);
      return {
        barChartCount: accumulator.barChartCount + counts.barChartCount,
        lineChartCount: accumulator.lineChartCount + counts.lineChartCount,
        bubbleChartCount: accumulator.bubbleChartCount + counts.bubbleChartCount,
        scatterChartCount: accumulator.scatterChartCount + counts.scatterChartCount,
        axisMinCount: accumulator.axisMinCount + counts.axisMinCount,
        axisMaxCount: accumulator.axisMaxCount + counts.axisMaxCount,
        chartDashCount: accumulator.chartDashCount + counts.chartDashCount,
        chartOuterShadowCount: accumulator.chartOuterShadowCount + counts.chartOuterShadowCount,
        chartBubbleScaleCount: accumulator.chartBubbleScaleCount + counts.chartBubbleScaleCount,
        chartDataPointCount: accumulator.chartDataPointCount + counts.chartDataPointCount,
        chartEmptyValueCount: accumulator.chartEmptyValueCount + counts.chartEmptyValueCount,
        bubbleSeriesCount: accumulator.bubbleSeriesCount + counts.bubbleSeriesCount,
      };
    },
    {
      barChartCount: 0,
      lineChartCount: 0,
      bubbleChartCount: 0,
      scatterChartCount: 0,
      axisMinCount: 0,
      axisMaxCount: 0,
      chartDashCount: 0,
      chartOuterShadowCount: 0,
      chartBubbleScaleCount: 0,
      chartDataPointCount: 0,
      chartEmptyValueCount: 0,
      bubbleSeriesCount: 0,
    },
  );
  return {
    shapeCount: countMatches(xml, /<p:sp\b/g),
    connectorCount: countMatches(xml, /<p:cxnSp\b|<a:prstGeom[^>]+prst="line"/g),
    roundRectCount: countMatches(xml, /<a:prstGeom[^>]+prst="roundRect"/g),
    ellipseCount: countMatches(xml, /<a:prstGeom[^>]+prst="ellipse"/g),
    pictureCount: countMatches(xml, /<p:pic\b/g),
    textRunCount: countMatches(xml, /<a:t>/g),
    bulletCount: countMatches(xml, /<a:buChar\b|<a:buAutoNum\b/g),
    numberedBulletCount: countMatches(xml, /<a:buAutoNum\b/g),
    lineSpacingCount: countMatches(xml, /<a:lnSpc\b/g),
    paragraphSpacingAfterCount: countMatches(xml, /<a:spcAft\b/g),
    gradFillCount: countMatches(xml, /<a:gradFill\b/g),
    outerShadowCount: countMatches(xml, /<a:outerShdw\b/g),
    chartCount: countMatches(xml, /<c:chart\b|<a:graphicData[^>]+\/chart/gi),
    chartFrameBounds: parseChartFrameBounds(xml),
    shapeBounds: parseShapeBounds(xml),
    tableCount: countMatches(xml, /<a:tbl\b/g),
    imageRelCount,
    chartRelCount,
    ...chartCounts,
  };
}

export async function readDownloadedText(download) {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Download did not resolve to a local file path.");
  }
  return fs.readFile(filePath, "utf8");
}

export async function readDownloadedPptx(download) {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("PPTX download did not resolve to a local file path.");
  }
  const raw = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(raw);
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const slideXml = await Promise.all(
    slideEntries.map(async (name) => ({
      name,
      xml: await zip.file(name).async("string"),
    })),
  );
  const slideRelationships = await Promise.all(
    slideEntries.map(async (name) => {
      const relPath = name.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
      const xml = await zip.file(relPath)?.async("string");
      const relationships = parseRelationships(xml ?? "");
      const chartXmlEntries = (
        await Promise.all(
          relationships
            .filter((entry) => /\/chart$/i.test(entry.type))
            .map(async (entry) => {
              const chartPath = resolveRelationshipTarget(name, entry.target);
              const chartXml = await zip.file(chartPath)?.async("string");
              return chartXml
                ? {
                    id: entry.id,
                    name: chartPath,
                    xml: chartXml,
                  }
                : null;
            }),
        )
      ).filter(Boolean);
      return {
        name: relPath,
        relationships,
        chartXmlEntries,
      };
    }),
  );
  const slideTexts = slideXml.map(({ name, xml }) => ({
    name,
    text: Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => decodeXmlEntities(match[1] ?? ""))
      .join(" "),
  }));
  const slideObjects = slideXml.map(({ name, xml }, index) => ({
    name,
    ...inspectSlideXml(
      xml,
      slideRelationships[index]?.relationships ?? [],
      slideRelationships[index]?.chartXmlEntries ?? [],
    ),
  }));
  const objectCounts = slideObjects.reduce(
    (accumulator, slide) => ({
      shapeCount: accumulator.shapeCount + slide.shapeCount,
      connectorCount: accumulator.connectorCount + slide.connectorCount,
      roundRectCount: accumulator.roundRectCount + slide.roundRectCount,
      pictureCount: accumulator.pictureCount + slide.pictureCount,
      textRunCount: accumulator.textRunCount + slide.textRunCount,
      bulletCount: accumulator.bulletCount + slide.bulletCount,
      numberedBulletCount: accumulator.numberedBulletCount + slide.numberedBulletCount,
      lineSpacingCount: accumulator.lineSpacingCount + slide.lineSpacingCount,
      paragraphSpacingAfterCount:
        accumulator.paragraphSpacingAfterCount + slide.paragraphSpacingAfterCount,
      gradFillCount: accumulator.gradFillCount + slide.gradFillCount,
      outerShadowCount: accumulator.outerShadowCount + slide.outerShadowCount,
      chartCount: accumulator.chartCount + slide.chartCount,
      tableCount: accumulator.tableCount + slide.tableCount,
      imageRelCount: accumulator.imageRelCount + slide.imageRelCount,
      chartRelCount: accumulator.chartRelCount + slide.chartRelCount,
      barChartCount: accumulator.barChartCount + slide.barChartCount,
      lineChartCount: accumulator.lineChartCount + slide.lineChartCount,
      bubbleChartCount: accumulator.bubbleChartCount + slide.bubbleChartCount,
      scatterChartCount: accumulator.scatterChartCount + slide.scatterChartCount,
      axisMinCount: accumulator.axisMinCount + slide.axisMinCount,
      axisMaxCount: accumulator.axisMaxCount + slide.axisMaxCount,
      ellipseCount: accumulator.ellipseCount + slide.ellipseCount,
      chartDashCount: accumulator.chartDashCount + slide.chartDashCount,
      chartOuterShadowCount: accumulator.chartOuterShadowCount + slide.chartOuterShadowCount,
      chartBubbleScaleCount: accumulator.chartBubbleScaleCount + slide.chartBubbleScaleCount,
      chartDataPointCount: accumulator.chartDataPointCount + slide.chartDataPointCount,
      chartEmptyValueCount: accumulator.chartEmptyValueCount + slide.chartEmptyValueCount,
      bubbleSeriesCount: accumulator.bubbleSeriesCount + slide.bubbleSeriesCount,
    }),
    {
      shapeCount: 0,
      connectorCount: 0,
      roundRectCount: 0,
      pictureCount: 0,
      textRunCount: 0,
      bulletCount: 0,
      numberedBulletCount: 0,
      lineSpacingCount: 0,
      paragraphSpacingAfterCount: 0,
      gradFillCount: 0,
      outerShadowCount: 0,
      chartCount: 0,
      tableCount: 0,
      imageRelCount: 0,
      chartRelCount: 0,
      barChartCount: 0,
      lineChartCount: 0,
      bubbleChartCount: 0,
      scatterChartCount: 0,
      axisMinCount: 0,
      axisMaxCount: 0,
      ellipseCount: 0,
      chartDashCount: 0,
      chartOuterShadowCount: 0,
      chartBubbleScaleCount: 0,
      chartDataPointCount: 0,
      chartEmptyValueCount: 0,
      bubbleSeriesCount: 0,
    },
  );
  const sizeMatch = presentationXml?.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i);
  const layoutSize =
    sizeMatch && sizeMatch[1] && sizeMatch[2]
      ? {
          cx: Number(sizeMatch[1]),
          cy: Number(sizeMatch[2]),
          aspectRatio: Number(sizeMatch[1]) / Math.max(Number(sizeMatch[2]), 1),
        }
      : null;
  return {
    presentationXml: presentationXml ?? null,
    layoutSize,
    slideCount: slideEntries.length,
    mediaFiles: Object.keys(zip.files).filter(
      (name) => /^ppt\/media\/.+/i.test(name) && !name.endsWith("/"),
    ),
    slideXml,
    slideRelationships,
    slideTexts,
    slideObjects,
    objectCounts,
    combinedText: slideTexts.map((entry) => entry.text).join(" "),
  };
}
