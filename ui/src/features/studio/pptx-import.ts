import JSZip from "jszip";
import type {
  BlockKind,
  DeckTemplatePack,
  DeckTemplatePackPage,
  DeckTemplatePackPageRole,
  ImportedSourceAssetRef,
  ImportedSourceObject,
  ImportedSourceShapeKind,
  ModuleConnection,
  ModuleChartKind,
  ModuleRegistryCategory,
  ModuleRegistryEntry,
  ModuleRendererCapability,
  ModuleTemplateFamily,
  ModuleTemplateField,
  PackImportWarning,
  PackSemanticDecoration,
  PackSemanticSlot,
} from "./types";

const IMPORT_PAGE_WIDTH = 1600;
const IMPORT_PAGE_HEIGHT = 900;
const DEFAULT_PAGE_BACKGROUND = "#FFFFFF";
const DEFAULT_TEXT_COLOR = "#102838";
const DEFAULT_STROKE_COLOR = "#A7B6BF";
const DEFAULT_FILL_COLOR = "#E9EEF2";

const SCHEME_COLOR_MAP: Record<string, string> = {
  bg1: "#FFFFFF",
  bg2: "#F4F1EA",
  tx1: "#102838",
  tx2: "#5B6B77",
  accent1: "#2A5CAA",
  accent2: "#C6994A",
  accent3: "#4D7F68",
  accent4: "#8C5A43",
  accent5: "#7A5AC7",
  accent6: "#2F8F8C",
};

type PptxImportWarningSeed = {
  severity: "warning" | "blocking";
  message: string;
  sourceObjectIds?: string[];
};

type SlideImportContext = {
  pageNumber: number;
  slidePath: string;
  slideXml: string;
  relsXml: string | null;
  zip: JSZip;
  slideWidthEmu: number;
  slideHeightEmu: number;
  saveAsset: (args: {
    blob: Blob;
    mimeType: string;
    alt?: string;
  }) => Promise<ImportedSourceAssetRef>;
};

type ChartModel = {
  chartKind?: ModuleChartKind;
  title?: string;
  categories: string[];
  series: Array<{
    name?: string;
    values: number[];
    color?: string;
  }>;
  warning?: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function truncate(value: string, length: number) {
  const normalized = normalizeText(value);
  if (normalized.length <= length) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n");
}

function matchTagBlocks(xml: string, tagName: string) {
  const pattern = new RegExp(
    `<${escapeRegExp(tagName)}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escapeRegExp(tagName)}>`,
    "g",
  );
  return Array.from(xml.matchAll(pattern), (match) => match[0]);
}

function findFirstTagBlock(xml: string, tagName: string) {
  const pattern = new RegExp(
    `<${escapeRegExp(tagName)}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escapeRegExp(tagName)}>`,
  );
  return xml.match(pattern)?.[0] ?? null;
}

function findSelfClosingTag(xml: string, tagName: string) {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}\\s[^>]*/>`);
  return xml.match(pattern)?.[0] ?? null;
}

function parseTagAttributes(tag: string | null) {
  if (!tag) {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    Array.from(tag.matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g), (match) => [
      match[1]!,
      decodeXmlEntities(match[2] ?? ""),
    ]),
  );
}

function getTextValues(xml: string, tagName = "a:t") {
  const pattern = new RegExp(`<${escapeRegExp(tagName)}>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "g");
  return Array.from(xml.matchAll(pattern), (match) => decodeXmlEntities(match[1] ?? ""));
}

function getInnerText(xml: string, tagName = "a:t") {
  return getTextValues(xml, tagName)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("");
}

function parseColor(xml: string | null, fallback: string) {
  if (!xml) {
    return fallback;
  }

  const solidBlock = findFirstTagBlock(xml, "a:solidFill");
  if (!solidBlock) {
    return fallback;
  }

  const srgb = parseTagAttributes(findSelfClosingTag(solidBlock, "a:srgbClr")).val;
  if (srgb && /^[0-9A-Fa-f]{6}$/.test(srgb)) {
    return `#${srgb.toUpperCase()}`;
  }

  const scheme = parseTagAttributes(findSelfClosingTag(solidBlock, "a:schemeClr")).val;
  if (scheme) {
    return SCHEME_COLOR_MAP[scheme] ?? fallback;
  }

  return fallback;
}

function parseLineWidth(lineXml: string | null) {
  if (!lineXml) {
    return undefined;
  }
  const attrs = parseTagAttributes(lineXml.match(/<a:ln\b[^>]*>/)?.[0] ?? null);
  const raw = Number(attrs.w ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.max(1, Math.round((raw / 12700) * 10) / 10);
}

function parseShapeGeometry(shapeXml: string): ImportedSourceShapeKind {
  const prst = parseTagAttributes(findSelfClosingTag(shapeXml, "a:prstGeom")).prst;
  return prst === "ellipse" ? "ellipse" : "rectangle";
}

function parseOffExt(xml: string) {
  const off = parseTagAttributes(findSelfClosingTag(xml, "a:off"));
  const ext = parseTagAttributes(findSelfClosingTag(xml, "a:ext"));
  return {
    x: Number(off.x ?? 0),
    y: Number(off.y ?? 0),
    cx: Number(ext.cx ?? 0),
    cy: Number(ext.cy ?? 0),
  };
}

function emuToPx(value: number, totalEmu: number, totalPx: number) {
  if (!Number.isFinite(value) || !Number.isFinite(totalEmu) || totalEmu <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((value / totalEmu) * totalPx));
}

function buildFrameFromOffExt(args: {
  offExt: { x: number; y: number; cx: number; cy: number };
  slideWidthEmu: number;
  slideHeightEmu: number;
}) {
  return {
    x: emuToPx(args.offExt.x, args.slideWidthEmu, IMPORT_PAGE_WIDTH),
    y: emuToPx(args.offExt.y, args.slideHeightEmu, IMPORT_PAGE_HEIGHT),
    w: emuToPx(args.offExt.cx, args.slideWidthEmu, IMPORT_PAGE_WIDTH),
    h: emuToPx(args.offExt.cy, args.slideHeightEmu, IMPORT_PAGE_HEIGHT),
  };
}

function parseTextBody(shapeXml: string) {
  const paragraphBlocks = matchTagBlocks(shapeXml, "a:p");
  const paragraphs = paragraphBlocks
    .map((block) => {
      const raw = Array.from(
        block.matchAll(/<a:(?:t|br)(?:[^>]*)>([\s\S]*?)<\/a:t>|<a:br\/>/g),
      );
      if (!raw.length) {
        const text = getTextValues(block).join("");
        return normalizeText(text);
      }
      return normalizeText(
        raw
          .map((match) => (match[0]?.startsWith("<a:br") ? "\n" : decodeXmlEntities(match[1] ?? "")))
          .join(""),
      );
    })
    .filter(Boolean);

  const firstRun = shapeXml.match(/<a:rPr\b[^>]*sz="(\d+)"/)?.[1];
  const fontSizePt = firstRun ? Number(firstRun) / 100 : 20;
  const fontSize = Math.max(12, Math.round(fontSizePt * (96 / 72)));
  const alignValue = shapeXml.match(/<a:pPr\b[^>]*algn="([^"]+)"/)?.[1] ?? "l";
  const align = alignValue === "ctr" ? "center" : alignValue === "r" ? "right" : "left";

  return {
    text: paragraphs.join("\n"),
    fontSize,
    align,
  } as const;
}

function parseRelationships(xml: string | null) {
  if (!xml) {
    return new Map<string, string>();
  }

  return new Map(
    Array.from(xml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g), (match) => [
      match[1]!,
      match[2]!,
    ]),
  );
}

function resolveRelativeZipPath(basePath: string, relativePath: string) {
  const baseSegments = basePath.split("/");
  baseSegments.pop();
  relativePath.split("/").forEach((segment) => {
    if (!segment || segment === ".") {
      return;
    }
    if (segment === "..") {
      baseSegments.pop();
      return;
    }
    baseSegments.push(segment);
  });
  return baseSegments.join("/");
}

function getExtensionMimeType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function inferChartKind(chartXml: string): ModuleChartKind | undefined {
  if (/<c:lineChart\b/.test(chartXml)) {
    return "line";
  }
  if (/<c:barChart\b/.test(chartXml)) {
    const grouping = chartXml.match(/<c:grouping\b[^>]*val="([^"]+)"/)?.[1];
    return grouping === "stacked" || grouping === "percentStacked" ? "stacked" : "bar";
  }
  if (/<c:waterfallChart\b/.test(chartXml)) {
    return "waterfall";
  }
  return undefined;
}

function parseChartCache(block: string, tagName: "c:strCache" | "c:numCache") {
  const cache = findFirstTagBlock(block, tagName);
  if (!cache) {
    return [] as string[];
  }

  return Array.from(cache.matchAll(/<c:pt\b[^>]*idx="(\d+)"[^>]*>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>[\s\S]*?<\/c:pt>/g))
    .map((match) => ({
      index: Number(match[1] ?? 0),
      value: decodeXmlEntities(match[2] ?? ""),
    }))
    .sort((left, right) => left.index - right.index)
    .map((item) => normalizeText(item.value))
    .filter(Boolean);
}

function parseChartTitle(chartXml: string) {
  const titleBlock = findFirstTagBlock(chartXml, "c:title");
  if (!titleBlock) {
    return "";
  }
  const richBlock = findFirstTagBlock(titleBlock, "a:rich");
  if (richBlock) {
    const texts = getTextValues(richBlock).join(" ");
    return normalizeText(texts);
  }
  return normalizeText(getInnerText(titleBlock, "c:v"));
}

function parseChartModel(chartXml: string): ChartModel {
  const chartKind = inferChartKind(chartXml);
  if (!chartKind) {
    return {
      chartKind: undefined,
      title: parseChartTitle(chartXml) || undefined,
      categories: [],
      series: [],
      warning: "This chart type could not be translated into a reusable semantic chart slot.",
    };
  }

  const seriesBlocks = matchTagBlocks(chartXml, "c:ser");
  const series = seriesBlocks.map((block) => {
    const name =
      normalizeText(getInnerText(findFirstTagBlock(block, "c:tx") ?? "", "c:v")) ||
      normalizeText(getInnerText(findFirstTagBlock(block, "c:tx") ?? "", "a:t")) ||
      undefined;
    const values = parseChartCache(block, "c:numCache").map((item) => Number(item) || 0);
    return {
      name,
      values,
    };
  });

  const categories =
    parseChartCache(findFirstTagBlock(seriesBlocks[0] ?? "", "c:cat") ?? "", "c:strCache") ||
    [];

  return {
    chartKind,
    title: parseChartTitle(chartXml) || undefined,
    categories,
    series,
  };
}

function createWarning(args: {
  pageNumber: number;
  index: number;
  seed: PptxImportWarningSeed;
}): PackImportWarning {
  return {
    id: `warning-p${args.pageNumber}-${args.index}`,
    severity: args.seed.severity,
    message: args.seed.message,
    sourceObjectIds: args.seed.sourceObjectIds ?? [],
  };
}

async function parsePictureObject(args: {
  block: string;
  index: number;
  pageNumber: number;
  rels: Map<string, string>;
  slidePath: string;
  zip: JSZip;
  slideWidthEmu: number;
  slideHeightEmu: number;
  saveAsset: SlideImportContext["saveAsset"];
}) {
  const offExt = parseOffExt(findFirstTagBlock(args.block, "a:xfrm") ?? "");
  const frame = buildFrameFromOffExt({
    offExt,
    slideWidthEmu: args.slideWidthEmu,
    slideHeightEmu: args.slideHeightEmu,
  });
  const relId = parseTagAttributes(args.block.match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[0] ?? null)[
    "r:embed"
  ];
  const target = relId ? args.rels.get(relId) ?? null : null;
  if (!target) {
    return {
      object: {
        id: `object-p${args.pageNumber}-${args.index}`,
        kind: "unsupported",
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        zIndex: args.index,
        label: "Picture",
        reason: "The picture relationship could not be resolved safely.",
        provenance: {
          slideRelId: relId,
          sourcePath: target ?? undefined,
        },
      } satisfies ImportedSourceObject,
      warnings: [
        {
          severity: "blocking" as const,
          message: "A picture on this page could not be resolved.",
        },
      ],
    };
  }

  const mediaPath = resolveRelativeZipPath(args.slidePath, target);
  const file = args.zip.file(mediaPath);
  if (!file) {
    return {
      object: {
        id: `object-p${args.pageNumber}-${args.index}`,
        kind: "unsupported",
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        zIndex: args.index,
        label: "Picture",
        reason: "The picture file is missing from the PPTX package.",
        provenance: {
          slideRelId: relId,
          sourcePath: mediaPath,
        },
      } satisfies ImportedSourceObject,
      warnings: [
        {
          severity: "blocking" as const,
          message: "A picture file referenced by this page is missing from the PPTX bundle.",
        },
      ],
    };
  }

  const blob = await file.async("blob");
  const mimeType = getExtensionMimeType(mediaPath);
  const asset = await args.saveAsset({
    blob,
    mimeType,
    alt: parseTagAttributes(args.block.match(/<p:cNvPr\b[^>]*name="([^"]+)"/)?.[0] ?? null).name,
  });

  return {
    object: {
      id: `object-p${args.pageNumber}-${args.index}`,
      kind: "image",
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      zIndex: args.index,
      asset,
      fit: "cover",
      provenance: {
        slideRelId: relId,
        sourceName: asset.alt,
        sourcePath: mediaPath,
      },
    } satisfies ImportedSourceObject,
    warnings: [] as PptxImportWarningSeed[],
  };
}

async function parseGraphicFrameObject(args: {
  block: string;
  index: number;
  pageNumber: number;
  rels: Map<string, string>;
  slidePath: string;
  zip: JSZip;
  slideWidthEmu: number;
  slideHeightEmu: number;
}) {
  const xfrm = findFirstTagBlock(args.block, "p:xfrm") ?? findFirstTagBlock(args.block, "a:xfrm") ?? "";
  const offExt = parseOffExt(xfrm);
  const frame = buildFrameFromOffExt({
    offExt,
    slideWidthEmu: args.slideWidthEmu,
    slideHeightEmu: args.slideHeightEmu,
  });

  const chartRelId = args.block.match(/<c:chart\b[^>]*r:id="([^"]+)"/)?.[1] ?? null;
  if (chartRelId) {
    const target = args.rels.get(chartRelId) ?? null;
    const chartPath = target ? resolveRelativeZipPath(args.slidePath, target) : "";
    const chartXml = chartPath ? await args.zip.file(chartPath)?.async("text") : null;
    const chart = chartXml ? parseChartModel(chartXml) : null;
    if (!chart || !chart.chartKind || !chart.series.length) {
      return {
        object: {
          id: `object-p${args.pageNumber}-${args.index}`,
          kind: "unsupported",
          x: frame.x,
          y: frame.y,
          w: frame.w,
          h: frame.h,
          zIndex: args.index,
          label: "Chart",
          reason:
            chart?.warning ??
            "This chart could not be translated into a semantic chart slot.",
          provenance: {
            slideRelId: chartRelId,
            sourcePath: chartPath || undefined,
          },
        } satisfies ImportedSourceObject,
        warnings: [
          {
            severity: "blocking" as const,
            message:
              chart?.warning ??
              "A chart on this page could not be translated into a semantic chart slot.",
          },
        ],
      };
    }

    return {
      object: {
        id: `object-p${args.pageNumber}-${args.index}`,
        kind: "chart",
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        zIndex: args.index,
        chartKind: chart.chartKind,
        title: chart.title,
        categories: chart.categories,
        series: chart.series,
        provenance: {
          slideRelId: chartRelId,
          sourcePath: chartPath || undefined,
        },
      } satisfies ImportedSourceObject,
      warnings: [] as PptxImportWarningSeed[],
    };
  }

  const isTable = /<a:tbl\b/.test(args.block);
  const isDiagram = /diagram|smartart/i.test(args.block);

  return {
    object: {
      id: `object-p${args.pageNumber}-${args.index}`,
      kind: "unsupported",
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      zIndex: args.index,
      label: isTable ? "Table" : isDiagram ? "SmartArt" : "Graphic frame",
      reason: isTable
        ? "Tables are imported as review-required objects in v1."
        : isDiagram
          ? "SmartArt and diagram frames are imported as review-required objects in v1."
          : "This graphic frame could not be translated safely.",
    } satisfies ImportedSourceObject,
    warnings: [
      {
        severity: "blocking" as const,
        message: isTable
          ? "A table on this page needs manual review before the pack can be published."
          : isDiagram
            ? "A SmartArt or diagram frame on this page needs manual review before publish."
            : "A graphic frame on this page could not be translated safely.",
      },
    ],
  };
}

async function parseSlideObjects(args: SlideImportContext) {
  const rels = parseRelationships(args.relsXml);
  const spTree = findFirstTagBlock(args.slideXml, "p:spTree") ?? args.slideXml;
  const blocks = Array.from(
    spTree.matchAll(/<(p:(?:sp|cxnSp|pic|graphicFrame|grpSp))\b[\s\S]*?<\/\1>/g),
    (match) => ({
      tag: match[1]!,
      block: match[0]!,
    }),
  );

  const objects: ImportedSourceObject[] = [];
  const warningSeeds: PptxImportWarningSeed[] = [];

  for (const [index, entry] of blocks.entries()) {
    if (entry.tag === "p:pic") {
      const result = await parsePictureObject({
        block: entry.block,
        index,
        pageNumber: args.pageNumber,
        rels,
        slidePath: args.slidePath,
        zip: args.zip,
        slideWidthEmu: args.slideWidthEmu,
        slideHeightEmu: args.slideHeightEmu,
        saveAsset: args.saveAsset,
      });
      objects.push(result.object);
      warningSeeds.push(...result.warnings);
      continue;
    }

    if (entry.tag === "p:graphicFrame") {
      const result = await parseGraphicFrameObject({
        block: entry.block,
        index,
        pageNumber: args.pageNumber,
        rels,
        slidePath: args.slidePath,
        zip: args.zip,
        slideWidthEmu: args.slideWidthEmu,
        slideHeightEmu: args.slideHeightEmu,
      });
      objects.push(result.object);
      warningSeeds.push(...result.warnings);
      continue;
    }

    if (entry.tag === "p:grpSp") {
      const offExt = parseOffExt(findFirstTagBlock(entry.block, "a:xfrm") ?? "");
      const frame = buildFrameFromOffExt({
        offExt,
        slideWidthEmu: args.slideWidthEmu,
        slideHeightEmu: args.slideHeightEmu,
      });
      const objectId = `object-p${args.pageNumber}-${index}`;
      objects.push({
        id: objectId,
        kind: "unsupported",
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        zIndex: index,
        label: "Grouped objects",
        reason: "Grouped drawing objects need manual review in v1.",
      });
      warningSeeds.push({
        severity: "blocking",
        message: "A grouped set of drawing objects needs manual review before publish.",
        sourceObjectIds: [objectId],
      });
      continue;
    }

    const xfrm = findFirstTagBlock(entry.block, "a:xfrm") ?? "";
    const offExt = parseOffExt(xfrm);
    const frame = buildFrameFromOffExt({
      offExt,
      slideWidthEmu: args.slideWidthEmu,
      slideHeightEmu: args.slideHeightEmu,
    });
    const objectId = `object-p${args.pageNumber}-${index}`;

    if (entry.tag === "p:cxnSp") {
      objects.push({
        id: objectId,
        kind: "line",
        x: frame.x,
        y: frame.y,
        w: Math.max(frame.w, 2),
        h: Math.max(frame.h, 2),
        zIndex: index,
        stroke: parseColor(entry.block, DEFAULT_STROKE_COLOR),
        strokeWidth: parseLineWidth(entry.block) ?? 1.5,
      });
      continue;
    }

    const textBody = parseTextBody(entry.block);
    if (normalizeText(textBody.text)) {
      objects.push({
        id: objectId,
        kind: "text",
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        zIndex: index,
        text: textBody.text,
        fontSize: textBody.fontSize,
        align: textBody.align,
        color: parseColor(entry.block, DEFAULT_TEXT_COLOR),
        fill: /<a:solidFill\b/.test(entry.block) ? parseColor(entry.block, DEFAULT_FILL_COLOR) : undefined,
        stroke: /<a:ln\b/.test(entry.block) ? parseColor(entry.block, DEFAULT_STROKE_COLOR) : undefined,
        strokeWidth: parseLineWidth(entry.block),
        radius: /roundRect/i.test(entry.block) ? 18 : undefined,
      });
      continue;
    }

    objects.push({
      id: objectId,
      kind: "shape",
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      zIndex: index,
      shape: parseShapeGeometry(entry.block),
      fill: parseColor(entry.block, DEFAULT_FILL_COLOR),
      stroke: /<a:ln\b/.test(entry.block) ? parseColor(entry.block, DEFAULT_STROKE_COLOR) : undefined,
      strokeWidth: parseLineWidth(entry.block),
      radius: /roundRect/i.test(entry.block) ? 18 : undefined,
    });
  }

  return {
    objects,
    warnings: warningSeeds.map((seed, index) =>
      createWarning({
        pageNumber: args.pageNumber,
        index,
        seed,
      }),
    ),
  };
}

function chooseTitleCandidate(textObjects: Extract<ImportedSourceObject, { kind: "text" }>[]) {
  return [...textObjects].sort((left, right) => {
    const score = (item: Extract<ImportedSourceObject, { kind: "text" }>) => {
      let total = 0;
      total += item.y < 220 ? 40 : 0;
      total += item.fontSize ? Math.min(item.fontSize, 48) : 18;
      total += item.text.length > 6 ? 10 : 0;
      total -= item.y / 100;
      return total;
    };
    return score(right) - score(left);
  })[0] ?? null;
}

export function semanticizeImportedPage(args: {
  pageNumber: number;
  title: string;
  sourceObjects: ImportedSourceObject[];
  warnings?: PackImportWarning[];
}) {
  const textObjects = args.sourceObjects
    .filter((item): item is Extract<ImportedSourceObject, { kind: "text" }> => item.kind === "text")
    .sort((left, right) => left.y - right.y || right.h - left.h);
  const chartObjects = args.sourceObjects.filter(
    (item): item is Extract<ImportedSourceObject, { kind: "chart" }> => item.kind === "chart",
  );
  const unsupportedIds = args.sourceObjects
    .filter((item) => item.kind === "unsupported")
    .map((item) => item.id);

  const titleCandidate = chooseTitleCandidate(textObjects);
  const semanticSlots: PackSemanticSlot[] = [];
  const semanticDecorations: PackSemanticDecoration[] = [];
  const slottedIds = new Set<string>();

  if (titleCandidate) {
    semanticSlots.push({
      id: `slot-p${args.pageNumber}-title`,
      kind: "ai-text",
      label: "Page title",
      role: "page-title",
      sourceObjectIds: [titleCandidate.id],
      required: true,
      canHide: false,
      notes: "Primary title region inferred from the imported slide.",
    });
    slottedIds.add(titleCandidate.id);
  }

  textObjects.forEach((object, index) => {
    if (slottedIds.has(object.id)) {
      return;
    }
    const normalized = normalizeText(object.text);
    const longForm = normalized.length >= 18 || normalized.includes("\n") || object.h >= 72;
    if (longForm) {
      semanticSlots.push({
        id: `slot-p${args.pageNumber}-text-${index}`,
        kind: "ai-text",
        label: semanticSlots.length === 0 ? "Primary narrative" : `Narrative ${semanticSlots.length}`,
        role: semanticSlots.length <= 1 ? "body" : "support",
        sourceObjectIds: [object.id],
        required: semanticSlots.length <= 1,
        canHide: semanticSlots.length > 1,
        notes: "Imported text region ready for AI-written content.",
      });
      slottedIds.add(object.id);
      return;
    }

    semanticDecorations.push({
      id: `decoration-p${args.pageNumber}-text-${index}`,
      label: normalizeText(object.text).slice(0, 28) || "Locked text",
      kind: "locked-text",
      sourceObjectIds: [object.id],
      locked: true,
    });
  });

  chartObjects.forEach((object, index) => {
    semanticSlots.push({
      id: `slot-p${args.pageNumber}-chart-${index}`,
      kind: "chart",
      label: object.title || `Chart ${index + 1}`,
      role: semanticSlots.length === 0 ? "chart" : "support",
      sourceObjectIds: [object.id],
      required: true,
      canHide: false,
      notes: "Imported native chart with recovered series data.",
    });
    slottedIds.add(object.id);
  });

  args.sourceObjects.forEach((object, index) => {
    if (slottedIds.has(object.id) || object.kind === "unsupported") {
      return;
    }

    if (object.kind === "text") {
      return;
    }

    semanticDecorations.push({
      id: `decoration-p${args.pageNumber}-${index}`,
      label:
        object.kind === "image"
          ? object.asset.alt || "Imported image"
          : object.kind === "shape"
            ? "Imported shape"
            : object.kind === "line"
              ? "Imported line"
              : object.kind === "chart"
                ? object.title || "Imported chart"
                : "Imported decoration",
      kind:
        object.kind === "image"
          ? "image"
          : object.kind === "line"
            ? "line"
            : object.kind === "chart"
              ? "chart"
              : "shape",
      sourceObjectIds: [object.id],
      locked: true,
    });
  });

  const resolvedTitle =
    titleCandidate?.text.split("\n")[0] ||
    normalizeText(args.title) ||
    `Page ${args.pageNumber}`;
  const pageRole: DeckTemplatePackPageRole =
    args.pageNumber === 1
      ? "cover"
      : chartObjects.length > 0
        ? "chart"
        : "content";

  return {
    title: resolvedTitle,
    semanticSlots,
    semanticDecorations,
    unresolvedObjectIds: unsupportedIds,
    warnings: args.warnings ?? [],
    pageRole,
    reusablePattern:
      chartObjects.length > 0 ? "chart-led content page" : "editorial content page",
    briefHint:
      titleCandidate?.text ||
      semanticSlots[0]?.label ||
      "Describe the job of this page before wiring downstream automation.",
    editableRule: "semantic-only" as const,
  };
}

function inferDraftCategory(kind: BlockKind): ModuleRegistryCategory {
  if (kind === "metrics" || kind === "line") return "evidence";
  if (kind === "bars" || kind === "matrix") return "comparison";
  if (kind === "gantt" || kind === "phases") return "roadmap";
  return "logic";
}

function inferDraftFamily(kind: BlockKind): ModuleTemplateFamily {
  if (kind === "metrics" || kind === "bars" || kind === "line" || kind === "gantt") {
    return "primitive";
  }
  if (kind === "flow" || kind === "phases") {
    return "story-pattern";
  }
  return "framework";
}

function inferDraftRendererCapabilities(kind: BlockKind): ModuleRendererCapability[] {
  if (kind === "metrics") return ["metric-grid"];
  if (kind === "bars") return ["bar-comparison"];
  if (kind === "line") return ["trend-line"];
  if (kind === "flow") return ["step-flow"];
  if (kind === "gantt") return ["timeline-roadmap"];
  if (kind === "phases") return ["phase-summary"];
  return ["matrix-grid"];
}

function inferDraftKindFromImportedPage(page: DeckTemplatePackPage): BlockKind {
  const firstChart = page.sourceObjects.find(
    (item): item is Extract<ImportedSourceObject, { kind: "chart" }> => item.kind === "chart",
  );
  if (firstChart?.chartKind === "line") {
    return "line";
  }
  if (firstChart?.chartKind) {
    return "bars";
  }
  const slotCount = page.semanticSlots.filter((slot) => slot.kind === "ai-text").length;
  if (slotCount >= 4 || page.pageRole === "section") {
    return "flow";
  }
  if (page.pageRole === "cover") {
    return "matrix";
  }
  return "matrix";
}

function clampCanvasLayout(layout: { x: number; y: number; w: number; h: number }) {
  return {
    x: Math.max(0, Math.min(159, Math.round(layout.x))),
    y: Math.max(0, Math.min(89, Math.round(layout.y))),
    w: Math.max(2, Math.min(160, Math.round(layout.w))),
    h: Math.max(2, Math.min(90, Math.round(layout.h))),
  };
}

function buildCanvasLayoutFromImportedObject(object: ImportedSourceObject) {
  return clampCanvasLayout({
    x: object.x / 10,
    y: object.y / 10,
    w: Math.max(4, object.w / 10),
    h: Math.max(4, object.h / 10),
  });
}

function buildCompanionDataLayout(chartLayout: { x: number; y: number; w: number; h: number }) {
  const width = Math.min(40, Math.max(24, Math.round(chartLayout.w * 0.44)));
  const height = 18;
  const belowFits = chartLayout.y + chartLayout.h + height + 2 <= 90;
  const nextY = belowFits
    ? chartLayout.y + chartLayout.h + 2
    : Math.max(0, chartLayout.y - height - 2);
  const nextX = Math.min(160 - width, Math.max(0, chartLayout.x + chartLayout.w - width));
  return clampCanvasLayout({
    x: nextX,
    y: nextY,
    w: width,
    h: height,
  });
}

function buildImportSource(args: {
  fileName: string;
  pageNumber: number;
  object: ImportedSourceObject;
  reviewState?: "ready" | "needs-review";
  reviewNote?: string;
}) {
  return {
    imported: true as const,
    sourceFileName: args.fileName,
    slideNumber: args.pageNumber,
    sourceObjectId: args.object.id,
    sourceObjectKind: args.object.kind,
    reviewState: args.reviewState ?? "ready",
    reviewNote: args.reviewNote,
    sourceName: args.object.provenance?.sourceName,
    sourcePath: args.object.provenance?.sourcePath,
  };
}

function buildImportedChartDataTable(
  chart: Extract<ImportedSourceObject, { kind: "chart" }>
): NonNullable<ModuleTemplateField["dataTable"]> {
  const categories =
    chart.categories.length > 0
      ? chart.categories
      : Array.from(
          { length: Math.max(0, ...chart.series.map((series) => series.values.length)) },
          (_, index) => `Item ${index + 1}`,
        );
  const columns = [
    {
      id: "category",
      label: "Category",
      type: "text" as const,
    },
    ...chart.series.map((series, index) => ({
      id: `series-${index + 1}`,
      label: series.name || `Series ${index + 1}`,
      type: "number" as const,
    })),
  ];
  const rows = categories.map((category, rowIndex) => [
    category,
    ...chart.series.map((series) => {
      const value = series.values[rowIndex];
      return Number.isFinite(value) ? String(value) : "";
    }),
  ]);
  const raw = [columns.map((column) => column.label).join("\t")]
    .concat(rows.map((row) => row.join("\t")))
    .join("\n");

  return {
    raw,
    hasHeader: true,
    columns,
    rows,
  };
}

function buildImportedDraftFrame(fields: ModuleTemplateField[]) {
  const artboardLayouts = fields
    .filter((field) => (field.surface ?? "artboard") === "artboard")
    .map((field) => field.layout)
    .filter((layout): layout is NonNullable<ModuleTemplateField["layout"]> => Boolean(layout));
  if (!artboardLayouts.length) {
    return {
      x: 8,
      y: 8,
      w: 144,
      h: 74,
    };
  }
  const minX = Math.min(...artboardLayouts.map((layout) => layout.x));
  const minY = Math.min(...artboardLayouts.map((layout) => layout.y));
  const maxX = Math.max(...artboardLayouts.map((layout) => layout.x + layout.w));
  const maxY = Math.max(...artboardLayouts.map((layout) => layout.y + layout.h));
  return clampCanvasLayout({
    x: Math.max(0, minX - 4),
    y: Math.max(0, minY - 4),
    w: Math.min(152, maxX - minX + 8),
    h: Math.min(82, maxY - minY + 8),
  });
}

function buildImportedTextOutputContract(args: {
  slot: PackSemanticSlot;
  object: Extract<ImportedSourceObject, { kind: "text" }>;
}): NonNullable<ModuleTemplateField["outputContract"]> {
  if (args.slot.role === "page-title") {
    return {
      goal: "State the page headline clearly and in one line.",
      format: "point",
      length: "short",
    };
  }

  return {
    goal:
      args.slot.role === "body"
        ? "Explain the main body argument in concise executive language."
        : "Support the page with one compact supporting point.",
    format: args.object.h >= 96 ? "bullets" : "point",
    length: args.object.h >= 96 ? "full" : "short",
  };
}

export function createModuleDraftFromImportedPage(args: {
  fileName: string;
  page: DeckTemplatePackPage;
}): ModuleRegistryEntry {
  const kind = inferDraftKindFromImportedPage(args.page);
  const slotByObjectId = new Map<string, PackSemanticSlot>();
  const decorationByObjectId = new Map<string, PackSemanticDecoration>();

  args.page.semanticSlots.forEach((slot) => {
    slot.sourceObjectIds.forEach((id) => slotByObjectId.set(id, slot));
  });
  args.page.semanticDecorations.forEach((decoration) => {
    decoration.sourceObjectIds.forEach((id) => decorationByObjectId.set(id, decoration));
  });

  const fields: ModuleTemplateField[] = [];
  const connections: ModuleConnection[] = [];

  [...args.page.sourceObjects]
    .sort((left, right) => left.zIndex - right.zIndex)
    .forEach((object, index) => {
      const slot = slotByObjectId.get(object.id) ?? null;
      const decoration = decorationByObjectId.get(object.id) ?? null;
      const layout = buildCanvasLayoutFromImportedObject(object);

      if (object.kind === "chart") {
        const dataFieldId = `field-import-${args.page.pageNumber}-${index}-data`;
        const chartFieldId = `field-import-${args.page.pageNumber}-${index}-chart`;
        fields.push({
          id: dataFieldId,
          label: `${slot?.label ?? object.title ?? `Chart ${index + 1}`} data`,
          type: "evidence",
          objectKind: "data",
          aiState: "locked",
          surface: "artboard",
          description: "Recovered chart data from the imported slide.",
          required: false,
          dataTable: buildImportedChartDataTable(object),
          style: {
            fill: "#f6f7f2",
            stroke: "#9bb6c2",
            strokeWidth: 1,
            strokeStyle: "solid",
            radius: "soft",
          },
          layout: buildCompanionDataLayout(layout),
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
        fields.push({
          id: chartFieldId,
          label: slot?.label ?? object.title ?? `Imported chart ${index + 1}`,
          type: "evidence",
          objectKind: "chart",
          aiState: "locked",
          surface: "artboard",
          description:
            slot?.notes ??
            "Recovered native chart from the imported slide. Keep the visual shell or reconnect it.",
          required: slot?.required ?? true,
          chartSpec: {
            kind: object.chartKind ?? "bar",
          },
          outputContract: {
            goal: "Show one compact source-backed chart.",
            format: "chart",
            length: "short",
          },
          style: {
            fill: "#f7f3eb",
            stroke: "#9bb6c2",
            strokeWidth: 1,
            strokeStyle: "solid",
            radius: "soft",
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
        connections.push({
          id: `connection-${dataFieldId}-${chartFieldId}`,
          sourceFieldId: dataFieldId,
          targetFieldId: chartFieldId,
          kind: "data-flow",
        });
        return;
      }

      if (object.kind === "unsupported") {
        fields.push({
          id: `field-import-${args.page.pageNumber}-${index}-review`,
          label: `Review: ${object.label}`,
          type: "custom",
          objectKind: "text",
          aiState: "locked",
          surface: "artboard",
          description: object.reason,
          required: false,
          style: {
            fill: "#8c5a26",
            stroke: "#d8a45f",
            strokeWidth: 1,
            strokeStyle: "dashed",
            radius: "soft",
            textAlign: "left",
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
            reviewState: "needs-review",
            reviewNote: object.reason,
          }),
        });
        return;
      }

      if (object.kind === "text" && slot?.kind === "ai-text") {
        fields.push({
          id: `field-import-${args.page.pageNumber}-${index}-slot`,
          label: slot.label,
          type: "custom",
          objectKind: "slot",
          aiState: "ai-fill",
          surface: "artboard",
          description:
            slot.notes ??
            "Imported text region converted into an editable AI text slot.",
          required: slot.required,
          example: normalizeText(object.text) || undefined,
          outputContract: buildImportedTextOutputContract({
            slot,
            object,
          }),
          style: {
            textAlign: object.align,
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
        return;
      }

      if (object.kind === "text") {
        fields.push({
          id: `field-import-${args.page.pageNumber}-${index}-text`,
          label: decoration?.label || truncate(object.text, 36) || `Locked text ${index + 1}`,
          type: "custom",
          objectKind: "text",
          aiState: "locked",
          surface: "artboard",
          description:
            decoration?.locked
              ? "Imported text decoration preserved from the original slide."
              : "Imported text content carried over from the original slide.",
          required: false,
          example: normalizeText(object.text) || undefined,
          style: {
            fill: object.color ?? DEFAULT_TEXT_COLOR,
            stroke: object.stroke,
            strokeWidth: object.strokeWidth,
            radius: object.fill ? "soft" : "none",
            textAlign: object.align,
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
        return;
      }

      if (object.kind === "shape") {
        fields.push({
          id: `field-import-${args.page.pageNumber}-${index}-shape`,
          label: decoration?.label || `Imported ${object.shape}`,
          type: "custom",
          objectKind: object.shape === "ellipse" ? "ellipse" : "rectangle",
          aiState: "locked",
          surface: "artboard",
          description: "Imported decorative shape.",
          required: false,
          style: {
            fill: object.fill ?? DEFAULT_FILL_COLOR,
            stroke: object.stroke ?? DEFAULT_STROKE_COLOR,
            strokeWidth: object.strokeWidth ?? 1,
            strokeStyle: "solid",
            radius: object.shape === "ellipse" ? "round" : "soft",
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
        return;
      }

      if (object.kind === "line") {
        fields.push({
          id: `field-import-${args.page.pageNumber}-${index}-line`,
          label: decoration?.label || "Imported line",
          type: "custom",
          objectKind: "line",
          aiState: "locked",
          surface: "artboard",
          description: "Imported divider or connector line.",
          required: false,
          style: {
            stroke: object.stroke ?? DEFAULT_STROKE_COLOR,
            strokeWidth: object.strokeWidth ?? 2,
            strokeStyle: "solid",
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
        return;
      }

      if (object.kind === "image") {
        fields.push({
          id: `field-import-${args.page.pageNumber}-${index}-image`,
          label: decoration?.label || object.asset.alt || `Imported image ${index + 1}`,
          type: "custom",
          objectKind: "image",
          aiState: "locked",
          surface: "artboard",
          description: "Imported image from the PPTX slide.",
          required: false,
          imageAsset: object.asset,
          imageFit: object.fit ?? "cover",
          style: {
            fill: "#edf2f5",
            stroke: "#9bb6c2",
            strokeWidth: 1,
            strokeStyle: "solid",
            radius: "soft",
          },
          layout,
          importSource: buildImportSource({
            fileName: args.fileName,
            pageNumber: args.page.pageNumber,
            object,
          }),
        });
      }
    });

  const label = truncate(args.page.title || `Imported slide ${args.page.pageNumber}`, 42) || `Imported slide ${args.page.pageNumber}`;
  const searchTerms = [args.fileName, args.page.title, args.page.reusablePattern, args.page.pageRole]
    .map(slugify)
    .filter(Boolean);

  return {
    id: `private.${
      slugify(`${label}-${args.page.pageNumber}`) || `imported-slide-${args.page.pageNumber}`
    }-${Date.now().toString(36)}.${kind}`,
    kind,
    label,
    category: inferDraftCategory(kind),
    scope: "private",
    status: "draft",
    family: inferDraftFamily(kind),
    semanticRole: `Reusable template translated from slide ${args.page.pageNumber} of ${args.fileName}. Preserve the imported reading order while turning the semantic slots into reusable authoring surfaces.`,
    description: `Imported from ${args.fileName}, slide ${args.page.pageNumber}. Continue editing the translated objects directly on canvas instead of redrawing the page from scratch.`,
    promptHint: `Use this template when a page needs the same structural pattern as "${label}". Keep imported decoration only when it supports the page, and rewrite AI slots to match the brief.`,
    useCases: [
      `Translate slide ${args.page.pageNumber} from ${args.fileName} into an editable single-page template.`,
      `Reuse the same layout logic without re-drawing the PPTX page manually.`,
    ],
    searchTerms,
    rendererCapabilities: inferDraftRendererCapabilities(kind),
    skillBindings: [],
    defaultSkillRequirements: [],
    supportedSkillClasses: ["framework", "domain", "output"],
    incompatibleSkillIds: [],
    examples: [],
    moduleFrame: buildImportedDraftFrame(fields),
    connections,
    thinkingFlow: {
      nodes: [],
      edges: [],
    },
    fields,
    order: 900,
    featured: false,
  } satisfies ModuleRegistryEntry;
}

async function importSlide(args: SlideImportContext): Promise<DeckTemplatePackPage> {
  const parsed = await parseSlideObjects(args);
  const semantic = semanticizeImportedPage({
    pageNumber: args.pageNumber,
    title: `Page ${args.pageNumber}`,
    sourceObjects: parsed.objects,
    warnings: parsed.warnings,
  });

  return {
    id: `pack-page-${args.pageNumber}`,
    pageNumber: args.pageNumber,
    title: semantic.title,
    background: DEFAULT_PAGE_BACKGROUND,
    sourceObjects: parsed.objects,
    semanticSlots: semantic.semanticSlots,
    semanticDecorations: semantic.semanticDecorations,
    unresolvedObjectIds: semantic.unresolvedObjectIds,
    warnings: semantic.warnings,
    pageRole: semantic.pageRole,
    reusablePattern: semantic.reusablePattern,
    briefHint: semantic.briefHint,
    editableRule: semantic.editableRule,
  };
}

export async function importDeckTemplatePackFromPptx(args: {
  fileName: string;
  blob: Blob;
  saveAsset: SlideImportContext["saveAsset"];
}) {
  const zip = await JSZip.loadAsync(await args.blob.arrayBuffer());
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) {
    throw new Error("The selected file is missing ppt/presentation.xml.");
  }

  const slideSizeAttrs = parseTagAttributes(findSelfClosingTag(presentationXml, "p:sldSz"));
  const slideWidthEmu = Number(slideSizeAttrs.cx ?? 12192000);
  const slideHeightEmu = Number(slideSizeAttrs.cy ?? 6858000);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return leftNumber - rightNumber;
    });

  if (!slidePaths.length) {
    throw new Error("The selected PPTX does not contain any slides.");
  }

  const pages = await Promise.all(
    slidePaths.map(async (slidePath, index) => {
      const slideXml = await zip.file(slidePath)?.async("text");
      if (!slideXml) {
        throw new Error(`Could not read ${slidePath} from the PPTX.`);
      }

      const relsPath = slidePath.replace(/\/([^/]+)\.xml$/i, "/_rels/$1.xml.rels");
      const relsXml = await zip.file(relsPath)?.async("text");
      return importSlide({
        pageNumber: index + 1,
        slidePath,
        slideXml,
        relsXml: relsXml ?? null,
        zip,
        slideWidthEmu,
        slideHeightEmu,
        saveAsset: args.saveAsset,
      });
    }),
  );

  const firstPageTitle = pages[0]?.title || "Imported deck";
  const packSlug = slugify(args.fileName.replace(/\.pptx$/i, "") || firstPageTitle || "deck-pack");

  return {
    id: `deck-pack.${packSlug}.${Date.now().toString(36)}`,
    label: normalizeText(args.fileName.replace(/\.pptx$/i, "")) || firstPageTitle || "Imported deck",
    sourceFileName: args.fileName,
    pageWidth: IMPORT_PAGE_WIDTH,
    pageHeight: IMPORT_PAGE_HEIGHT,
    pages,
    publishArtifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies DeckTemplatePack;
}
