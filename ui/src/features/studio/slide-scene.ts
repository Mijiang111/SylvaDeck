import { GRID_COLUMNS, GRID_GAP, GRID_ROWS } from "./config";
import { hasSceneDesignFailure, evaluateSceneDesignIssues } from "./design-critic";
import { resolveGenerationAnalysisSkill } from "./analysis-skills";
import type {
  GenerationDesignPlan,
  GenerationPageArchetypeDefinition,
  GenerationTemplateSkillDefinition,
} from "./generation-contract";
import { resolveGenerationPageArchetype } from "./page-archetypes";
import { resolveGenerationTemplateSkill } from "./template-skills";
import { resolveGenerationThinkingMode } from "./thinking-mode";
import type {
  LayoutBlock,
  LayoutPage,
  PageDraft,
  SlideScene,
  SlideSceneChartAppearance,
  SlideSceneChartObject,
  SlideSceneDataAppearance,
  SlideSceneDataItem,
  SlideSceneDataObject,
  SlideSceneObject,
  SlideSceneObjectKind,
  SlideSceneTextObject,
  StoryPageRole,
} from "./types";

export const SLIDE_SCENE_WIDTH = 1600;
export const SLIDE_SCENE_HEIGHT = 900;

const SCENE_OBJECT_LIMIT = 64;
const SCENE_TEXT_LIMIT = 1600;

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function clampText(value: unknown, fallback = "", maximum = SCENE_TEXT_LIMIT) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, maximum);
}

function clampOptionalText(value: unknown, maximum: number) {
  const next = clampText(value, "", maximum);
  return next || undefined;
}

function clampColor(value: unknown, fallback: string) {
  const next = clampText(value, fallback, 32);
  return next || fallback;
}

function ensureObjectKind(value: unknown): SlideSceneObjectKind | null {
  return value === "text" ||
    value === "rectangle" ||
    value === "ellipse" ||
    value === "line" ||
    value === "data" ||
    value === "chart"
    ? value
    : null;
}

function normalizeSceneBaseObject(
  value: Record<string, unknown>,
  kind: SlideSceneObjectKind,
) {
  return {
    id: clampText(value.id, `${kind}-${Math.random().toString(36).slice(2, 8)}`, 120),
    kind,
    x: clampNumber(value.x, 0, SLIDE_SCENE_WIDTH, 0),
    y: clampNumber(value.y, 0, SLIDE_SCENE_HEIGHT, 0),
    w: clampNumber(value.w, 8, SLIDE_SCENE_WIDTH, 120),
    h: clampNumber(value.h, 8, SLIDE_SCENE_HEIGHT, 80),
    zIndex: clampNumber(value.zIndex, 0, 300, 0),
    rotation: clampNumber(value.rotation, -180, 180, 0),
    opacity: clampNumber(value.opacity, 0, 1, 1),
  };
}

function normalizeSceneDataItems(value: unknown): SlideSceneDataItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .slice(0, 8)
    .map((item, index) => ({
      eyebrow: clampOptionalText(item.eyebrow, 80),
      title: clampText(item.title, `Item ${index + 1}`, 160),
      body: clampOptionalText(item.body, 360),
      value: clampOptionalText(item.value, 80),
      accent: clampOptionalText(item.accent, 32),
    }));
}

function normalizeSceneSeries(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .slice(0, 8)
    .map((item, index) => ({
      label: clampText(item.label, `Series ${index + 1}`, 160),
      value: clampText(item.value, `${index + 1}`, 80),
      color: clampOptionalText(item.color, 32),
    }));
}

function normalizeSceneChartData(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const categories = Array.isArray(candidate.categories)
    ? candidate.categories
        .map((item, index) => clampText(item, `Category ${index + 1}`, 120))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const series = Array.isArray(candidate.series)
    ? candidate.series
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .slice(0, 8)
        .map((item, index) => ({
          name: clampOptionalText(item.name, 120),
          values: Array.isArray(item.values)
            ? item.values
                .slice(0, Math.max(categories.length, 12))
                .map((entry) => clampNumber(entry, -1000000, 1000000, 0))
            : [],
          color: clampOptionalText(item.color, 32),
        }))
        .filter((item) => item.values.length > 0)
    : [];

  if (!categories.length || !series.length) {
    return undefined;
  }

  return {
    categories,
    series: series.map((item) => ({
      ...item,
      values: item.values.slice(0, categories.length),
    })),
    xAxisTitle: clampOptionalText(candidate.xAxisTitle, 120),
    yAxisTitle: clampOptionalText(candidate.yAxisTitle, 120),
  };
}

function normalizeSceneDataAppearance(value: unknown): SlideSceneDataAppearance | undefined {
  return value === "plain" || value === "panel" || value === "stat" || value === "list"
    ? value
    : undefined;
}

function normalizeSceneChartAppearance(value: unknown): SlideSceneChartAppearance | undefined {
  return value === "minimal" || value === "panel" ? value : undefined;
}

function normalizeSceneObject(value: unknown): SlideSceneObject | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const kind = ensureObjectKind(candidate.kind);
  if (!kind) {
    return null;
  }

  const base = normalizeSceneBaseObject(candidate, kind);
  if (kind === "text") {
    return {
      ...base,
      kind,
      text: clampText(candidate.text, "Text", 1200),
      color: clampOptionalText(candidate.color, 32),
      fontSize: clampNumber(candidate.fontSize, 12, 120, 24),
      fontWeight: clampNumber(candidate.fontWeight, 300, 900, 500),
      fontFamily: clampOptionalText(candidate.fontFamily, 120),
      lineHeight: clampNumber(candidate.lineHeight, 0.8, 2.4, 1.15),
      letterSpacing: clampNumber(candidate.letterSpacing, -2, 20, 0),
      textAlign:
        candidate.textAlign === "center" || candidate.textAlign === "right"
          ? candidate.textAlign
          : "left",
      italic: Boolean(candidate.italic),
      uppercase: Boolean(candidate.uppercase),
      fill: clampOptionalText(candidate.fill, 32),
      radius: clampNumber(candidate.radius, 0, 120, 0),
      padding: clampNumber(candidate.padding, 0, 64, 0),
    } satisfies SlideSceneTextObject;
  }

  if (kind === "rectangle" || kind === "ellipse") {
    return {
      ...base,
      kind,
      fill: clampOptionalText(candidate.fill, 32),
      stroke: clampOptionalText(candidate.stroke, 32),
      strokeWidth: clampNumber(candidate.strokeWidth, 0, 24, 0),
      radius: clampNumber(candidate.radius, 0, 160, kind === "ellipse" ? 999 : 16),
    };
  }

  if (kind === "line") {
    return {
      ...base,
      kind,
      stroke: clampOptionalText(candidate.stroke, 32),
      strokeWidth: clampNumber(candidate.strokeWidth, 1, 24, 2),
    };
  }

  if (kind === "chart") {
    return {
      ...base,
      kind,
      chartKind:
        candidate.chartKind === "stacked" ||
        candidate.chartKind === "line" ||
        candidate.chartKind === "waterfall"
          ? candidate.chartKind
          : "bar",
      title: clampOptionalText(candidate.title, 160),
      body: clampOptionalText(candidate.body, 320),
      series: normalizeSceneSeries(candidate.series),
      chartData: normalizeSceneChartData(candidate.chartData),
      appearance: normalizeSceneChartAppearance(candidate.appearance),
      fill: clampOptionalText(candidate.fill, 32),
      stroke: clampOptionalText(candidate.stroke, 32),
      strokeWidth: clampNumber(candidate.strokeWidth, 0, 24, 0),
      radius: clampNumber(candidate.radius, 0, 120, 24),
      color: clampOptionalText(candidate.color, 32),
    } satisfies SlideSceneChartObject;
  }

  return {
    ...base,
    kind,
    eyebrow: clampOptionalText(candidate.eyebrow, 80),
    title: clampOptionalText(candidate.title, 160),
    body: clampOptionalText(candidate.body, 480),
    value: clampOptionalText(candidate.value, 80),
    items: normalizeSceneDataItems(candidate.items),
    appearance: normalizeSceneDataAppearance(candidate.appearance),
    layout:
      candidate.layout === "grid-2" ||
      candidate.layout === "grid-4" ||
      candidate.layout === "row"
        ? candidate.layout
        : "stack",
    fill: clampOptionalText(candidate.fill, 32),
    stroke: clampOptionalText(candidate.stroke, 32),
    strokeWidth: clampNumber(candidate.strokeWidth, 0, 24, 0),
    radius: clampNumber(candidate.radius, 0, 120, 24),
    color: clampOptionalText(candidate.color, 32),
    textAlign:
      candidate.textAlign === "center" || candidate.textAlign === "right"
        ? candidate.textAlign
        : "left",
  } satisfies SlideSceneDataObject;
}

export function normalizeSlideScene(scene: unknown): SlideScene | undefined {
  if (!scene || typeof scene !== "object") {
    return undefined;
  }

  const candidate = scene as Record<string, unknown>;
  const objects = Array.isArray(candidate.objects)
    ? candidate.objects
        .map((object) => normalizeSceneObject(object))
        .filter((object): object is SlideSceneObject => Boolean(object))
        .slice(0, SCENE_OBJECT_LIMIT)
    : [];

  return {
    width: clampNumber(candidate.width, 320, 2400, SLIDE_SCENE_WIDTH),
    height: clampNumber(candidate.height, 180, 1600, SLIDE_SCENE_HEIGHT),
    background: clampColor(candidate.background, "#f7f3eb"),
    objects,
  };
}

export function gridFrameToSceneFrame(block: LayoutBlock) {
  const marginX = 72;
  const topY = 250;
  const bottomMargin = 64;
  const bodyWidth = SLIDE_SCENE_WIDTH - marginX * 2;
  const bodyHeight = SLIDE_SCENE_HEIGHT - topY - bottomMargin;
  const cellWidth = (bodyWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const cellHeight = (bodyHeight - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;

  return {
    x: marginX + (block.x - 1) * (cellWidth + GRID_GAP),
    y: topY + (block.y - 1) * (cellHeight + GRID_GAP),
    w: block.w * cellWidth + (block.w - 1) * GRID_GAP,
    h: block.h * cellHeight + (block.h - 1) * GRID_GAP,
  };
}

const PROCESS_PATTERNS = [
  /page claim/gi,
  /page instruction/gi,
  /evidence to carry(?: forward)?/gi,
  /bridge to next page/gi,
  /supporting points?/gi,
  /evidence notes?/gi,
  /paste source text/gi,
  /generate (?:a|the) draft/gi,
  /write the report/gi,
  /module collage/gi,
  /placeholder/gi,
  /continue the sequence/gi,
  /add another comparison angle/gi,
];

function sanitizeVisibleText(value: unknown, fallback = "", maximum = 320) {
  const base = clampText(value, fallback, maximum);
  let next = base;
  for (const pattern of PROCESS_PATTERNS) {
    next = next.replace(pattern, " ");
  }
  next = next.replace(/\s+/g, " ").trim();
  return next || fallback;
}

function uniqueTextList(values: string[], maximum: number) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const next = sanitizeVisibleText(value, "", 220);
    if (!next) {
      continue;
    }
    const key = next.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(next);
    if (items.length >= maximum) {
      break;
    }
  }
  return items;
}

function paletteForPlanRole(role?: StoryPageRole) {
  if (role === "evidence-layer" || role === "closing-synthesis") {
    return {
      background: "#f3f5f7",
      wash: "#dfe9ef",
      surface: "#ffffff",
      surfaceSoft: "#eef3f6",
      line: "#c9d5de",
      accent: "#173d57",
      text: "#17283b",
      muted: "#607181",
    };
  }

  if (role === "opening-frame" || role === "decision-bridge") {
    return {
      background: "#f7f1e6",
      wash: "#eadcba",
      surface: "#fffaf1",
      surfaceSoft: "#f4ead5",
      line: "#d9c7a3",
      accent: "#9b6516",
      text: "#1a2738",
      muted: "#687786",
    };
  }

  return {
    background: "#eef6f5",
    wash: "#dceceb",
    surface: "#fbfefd",
    surfaceSoft: "#edf6f5",
    line: "#c7d9d6",
    accent: "#1d5f5b",
    text: "#18313d",
    muted: "#667987",
  };
}

function paletteForTemplate(args: {
  role?: StoryPageRole;
  templateSkill: GenerationTemplateSkillDefinition;
}) {
  const base = paletteForPlanRole(args.role);
  return {
    background: args.templateSkill.theme.background || base.background,
    wash: args.templateSkill.theme.surfaceAlt || base.wash,
    surface: args.templateSkill.theme.surface || base.surface,
    surfaceSoft: args.templateSkill.theme.surfaceAlt || base.surfaceSoft,
    line: args.templateSkill.theme.surfaceAlt || base.line,
    accent: args.templateSkill.theme.accent || base.accent,
    text: args.templateSkill.theme.text || base.text,
    muted: args.templateSkill.theme.muted || base.muted,
    chartPrimary: args.templateSkill.theme.chartPrimary || args.templateSkill.theme.accent || base.accent,
    chartSecondary: args.templateSkill.theme.chartSecondary || base.accent,
  };
}

function toSceneItems(values: string[], prefix: string): SlideSceneDataItem[] {
  return uniqueTextList(values, 4).map((value, index) => ({
    title: sanitizeVisibleText(value, `${prefix} ${index + 1}`, 160),
    body: undefined,
  }));
}

function createTextObject(args: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  zIndex?: number;
}) {
  return {
    id: args.id,
    kind: "text" as const,
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    zIndex: args.zIndex ?? 10,
    text: args.text,
    color: args.color,
    fontSize: args.fontSize,
    fontWeight: args.fontWeight,
    lineHeight: args.lineHeight ?? 1.15,
    letterSpacing: args.letterSpacing ?? 0,
    uppercase: args.uppercase ?? false,
  };
}

function createRectangleObject(args: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
  zIndex?: number;
}) {
  return {
    id: args.id,
    kind: "rectangle" as const,
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    zIndex: args.zIndex ?? 2,
    fill: args.fill,
    stroke: args.stroke,
    strokeWidth: args.strokeWidth ?? 0,
    radius: args.radius ?? 24,
    opacity: args.opacity ?? 1,
  };
}

function createLineObject(args: {
  id: string;
  x: number;
  y: number;
  w: number;
  stroke: string;
  strokeWidth?: number;
  zIndex?: number;
}) {
  return {
    id: args.id,
    kind: "line" as const,
    x: args.x,
    y: args.y,
    w: args.w,
    h: 2,
    zIndex: args.zIndex ?? 6,
    stroke: args.stroke,
    strokeWidth: args.strokeWidth ?? 2,
  };
}

function createDataObject(args: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  body?: string;
  items: SlideSceneDataItem[];
  appearance?: SlideSceneDataAppearance;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  color?: string;
  layout?: "stack" | "grid-2" | "grid-4" | "row";
  zIndex?: number;
}) {
  return {
    id: args.id,
    kind: "data" as const,
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    zIndex: args.zIndex ?? 8,
    title: args.title,
    body: args.body,
    items: args.items,
    appearance: args.appearance ?? "list",
    fill: args.fill,
    stroke: args.stroke,
    strokeWidth: args.strokeWidth ?? 0,
    radius: args.radius ?? 22,
    color: args.color,
    layout: args.layout ?? "stack",
  };
}

function createChartObject(args: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  body?: string;
  series: Array<{ label: string; value: string; color?: string }>;
  appearance?: "panel" | "minimal";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  color?: string;
  zIndex?: number;
}) {
  return {
    id: args.id,
    kind: "chart" as const,
    chartKind: "bar" as const,
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    zIndex: args.zIndex ?? 8,
    title: args.title,
    body: args.body,
    series: args.series,
    appearance: args.appearance ?? "minimal",
    fill: args.fill,
    stroke: args.stroke,
    strokeWidth: args.strokeWidth ?? 0,
    radius: args.radius ?? 24,
    color: args.color,
  };
}

function countWords(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/).filter(Boolean).length;
}

function parseHexColor(value: string) {
  const hex = value.trim().replace("#", "");
  if (hex.length === 3) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    return parseHexColor(`#${expanded}`);
  }
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) {
    return null;
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function parseRgbColor(value: string) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const parts = match[1]
    .split(",")
    .map((item) => Number.parseFloat(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (parts.length < 3) {
    return null;
  }
  return {
    r: clampNumber(parts[0], 0, 255, 0),
    g: clampNumber(parts[1], 0, 255, 0),
    b: clampNumber(parts[2], 0, 255, 0),
  };
}

function parseColorChannels(value?: string | null) {
  if (!value) {
    return null;
  }
  return parseHexColor(value) ?? parseRgbColor(value);
}

function relativeLuminance(value?: string | null) {
  const channels = parseColorChannels(value);
  if (!channels) {
    return null;
  }
  const normalize = (channel: number) => {
    const next = channel / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  const r = normalize(channels.r);
  const g = normalize(channels.g);
  const b = normalize(channels.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground?: string | null, background?: string | null) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) {
    return null;
  }
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function isDarkSurface(value?: string | null) {
  const luminance = relativeLuminance(value);
  return luminance !== null && luminance < 0.18;
}

function trimTextToBudget(value: unknown, maximumChars: number, maximumWords: number, fallback = "") {
  const sanitized = sanitizeVisibleText(value, fallback, maximumChars * 3);
  if (!sanitized) {
    return fallback;
  }

  const sentences = sanitized
    .split(/(?<=[.!?。；;])/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length > 1) {
    let sentenceCandidate = "";
    for (const sentence of sentences) {
      const next = sentenceCandidate ? `${sentenceCandidate} ${sentence}` : sentence;
      if (next.length > maximumChars || countWords(next) > maximumWords) {
        break;
      }
      sentenceCandidate = next;
    }
    if (sentenceCandidate) {
      return sentenceCandidate;
    }
  }

  const wordCandidate = sanitized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maximumWords)
    .join(" ");

  return wordCandidate.length > maximumChars
    ? wordCandidate.slice(0, maximumChars).trim()
    : wordCandidate;
}

function toBudgetedSceneItems(
  values: string[],
  prefix: string,
  count: number,
  maxChars: number,
): SlideSceneDataItem[] {
  return uniqueTextList(values, count).map((value, index) => ({
    title: trimTextToBudget(value, maxChars, 10, `${prefix} ${index + 1}`),
    body: undefined,
  }));
}

function buildFallbackPlan(page: LayoutPage, pageDraft: PageDraft): GenerationDesignPlan {
  const plan = page.storyPagePlan;
  const objective =
    sanitizeVisibleText(plan?.objective || page.note || page.title, page.title, 220);
  const keyClaim = trimTextToBudget(
    plan?.keyClaim || pageDraft.summary || objective,
    180,
    20,
    objective,
  );

  return {
    pageRole: sanitizeVisibleText(plan?.pageRole || "standalone-page", "standalone-page", 80),
    objective,
    keyClaim,
    supportingPoints:
      plan?.supportingPoints?.length
        ? plan.supportingPoints
        : objective && objective !== keyClaim
          ? [objective]
          : [keyClaim],
    evidenceNotes:
      plan?.evidenceNotes?.length
        ? plan.evidenceNotes
        : plan?.evidenceNeeded?.length
          ? plan.evidenceNeeded
          : objective && objective !== keyClaim
            ? [objective]
            : [],
    transitionFromPrevious: sanitizeVisibleText(plan?.transitionFromPrevious || "", "", 180),
    bridgeToNext: sanitizeVisibleText(plan?.bridgeToNext || "", "", 180),
  };
}

function resolveFallbackPresentationContext(args: {
  page: LayoutPage;
  plan: GenerationDesignPlan;
}) {
  const thinkingMode = resolveGenerationThinkingMode(
    [args.page.title, args.page.note, args.plan.pageRole, args.plan.objective, args.plan.keyClaim].join(" "),
  );
  const analysisSkill = resolveGenerationAnalysisSkill({
    sourceText: "",
    pageTitle: args.page.title,
    pageNote: args.page.note,
    plan: args.plan,
    thinkingMode,
  });
  const pageArchetype = resolveGenerationPageArchetype({
    sourceText: "",
    pageTitle: args.page.title,
    pageNote: args.page.note,
    plan: args.plan,
    analysisSkill,
    thinkingMode,
  });
  const templateSkill = resolveGenerationTemplateSkill({
    sourceText: "",
    pageTitle: args.page.title,
    pageNote: args.page.note,
    plan: args.plan,
    analysisSkill,
    pageArchetype,
  });

  return {
    analysisSkill,
    pageArchetype,
    templateSkill,
  };
}

function buildChartSeriesFromPlan(plan: GenerationDesignPlan) {
  const inputs = [...plan.evidenceNotes, ...plan.supportingPoints];
  const series = inputs
    .map((value, index) => {
      const normalized = sanitizeVisibleText(value, "", 220);
      if (!normalized) {
        return null;
      }
      const numericMatch = normalized.match(/(?:<|>|~)?\d[\d,.]*(?:\.\d+)?%?/);
      if (!numericMatch) {
        return null;
      }
      const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
      const labelSource = yearMatch?.[0] ?? normalized.replace(numericMatch[0], "").trim();
      return {
        label: trimTextToBudget(labelSource || `Point ${index + 1}`, 20, 4, `Point ${index + 1}`),
        value: numericMatch[0],
      };
    })
    .filter((item): item is { label: string; value: string } => Boolean(item))
    .slice(0, 5);

  return series.length >= 3 ? series : [];
}

function collectSceneVisibleTexts(scene: SlideScene) {
  return scene.objects.flatMap((object) => {
    if (object.kind === "text") {
      return [object.text];
    }
    if (object.kind === "data") {
      const items = object.items ?? [];
      return [
        object.title ?? "",
        object.body ?? "",
        object.value ?? "",
        ...items.flatMap((item) => [item.eyebrow ?? "", item.title, item.body ?? "", item.value ?? ""]),
      ];
    }
    if (object.kind === "chart") {
      return [object.title ?? "", object.body ?? ""];
    }
    return [];
  });
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sceneLooksOverloaded(args: {
  scene: SlideScene;
  plan: GenerationDesignPlan;
  pageTitle: string;
  pageNote: string;
}) {
  const thinkingMode = resolveGenerationThinkingMode(
    [args.pageTitle, args.pageNote, args.plan.pageRole, args.plan.objective, args.plan.keyClaim].join(" "),
  );
  const archetype = resolveGenerationPageArchetype({
    pageTitle: args.pageTitle,
    pageNote: args.pageNote,
    plan: args.plan,
    analysisSkill: null,
    thinkingMode,
  });
  const budget = archetype.copyBudget;
  const totalWords = collectSceneVisibleTexts(args.scene).reduce(
    (count, text) => count + countWords(sanitizeVisibleText(text, "", 480)),
    0,
  );
  const overloadedTextBlocks = args.scene.objects.filter((object) => {
    if (object.kind !== "text") {
      return false;
    }
    return countWords(object.text) > 18 && object.w > 540;
  }).length;

  return (
    totalWords > Math.round(budget.totalVisibleWords * 1.45) ||
    overloadedTextBlocks >= 2 ||
    args.scene.objects.length > budget.recommendedObjectMax + 4
  );
}

function sceneHasRepetitiveCopy(args: {
  scene: SlideScene;
  pageTitle: string;
  pageNote: string;
}) {
  const texts = collectSceneVisibleTexts(args.scene)
    .map((text) => sanitizeVisibleText(text, "", 480))
    .filter(Boolean);
  const duplicates = new Map<string, number>();

  for (const text of texts) {
    const normalized = normalizeComparableText(text);
    if (!normalized || normalized.length < 20) {
      continue;
    }
    duplicates.set(normalized, (duplicates.get(normalized) ?? 0) + 1);
  }

  for (const count of duplicates.values()) {
    if (count >= 2) {
      return true;
    }
  }

  const note = normalizeComparableText(args.pageNote);
  const title = normalizeComparableText(args.pageTitle);
  const repeatedNoteCount = texts.filter((text) => normalizeComparableText(text) === note).length;
  const repeatedTitleCount = texts.filter((text) => normalizeComparableText(text) === title).length;

  return repeatedNoteCount >= 2 || repeatedTitleCount >= 2;
}

function sceneHasUnsafeBounds(scene: SlideScene) {
  return scene.objects.some((object) => {
    if (object.x < -4 || object.y < -4) {
      return true;
    }
    if (object.x + object.w > scene.width + 4) {
      return true;
    }
    if (object.y + object.h > scene.height + 4) {
      return true;
    }
    return false;
  });
}

function sceneHasLowContrast(scene: SlideScene) {
  return scene.objects.some((object) => {
    if (object.kind === "text") {
      const ratio = contrastRatio(object.color ?? "#102838", object.fill ?? scene.background);
      return ratio !== null && ratio < 3.2;
    }

    if (object.kind === "data" || object.kind === "chart") {
      const fill = object.fill ?? scene.background;
      if (!isDarkSurface(fill)) {
        return false;
      }
      const ratio = contrastRatio(object.color ?? "#102838", fill);
      return ratio !== null && ratio < 4.2;
    }

    return false;
  });
}

function sceneNeedsFallback(args: {
  scene: SlideScene;
  plan: GenerationDesignPlan;
  pageTitle: string;
  pageNote: string;
}) {
  return (
    sceneLooksOverloaded(args) ||
    sceneHasUnsafeBounds(args.scene) ||
    sceneHasLowContrast(args.scene) ||
    sceneHasRepetitiveCopy({
      scene: args.scene,
      pageTitle: args.pageTitle,
      pageNote: args.pageNote,
    })
  );
}

function buildHeroRailScene(args: {
  page: LayoutPage;
  pageDraft: PageDraft;
  plan: GenerationDesignPlan;
  pageArchetype: GenerationPageArchetypeDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
}) {
  const { page, plan } = args;
  const budget = args.pageArchetype.copyBudget;
  const palette = paletteForTemplate({
    role: page.storyPagePlan?.pageRole,
    templateSkill: args.templateSkill,
  });
  const title = trimTextToBudget(page.title, budget.headlineMaxChars, 16, "Untitled page");
  const eyebrow = sanitizeVisibleText(page.chapter, "Chapter", 80);
  const thesis = trimTextToBudget(plan.keyClaim || page.note || page.title, budget.thesisMaxChars, 22, title);
  const subtitle = trimTextToBudget(plan.objective || page.note, 110, 14, "");
  const showSubtitle = normalizeComparableText(subtitle) !== normalizeComparableText(thesis);
  const supportingItems = toBudgetedSceneItems(
    plan.supportingPoints.length ? plan.supportingPoints : [thesis],
    "Point",
    budget.supportingPointCount,
    budget.supportingPointMaxChars,
  );
  const evidenceItems = toBudgetedSceneItems(
    plan.evidenceNotes.length ? plan.evidenceNotes : [subtitle || thesis],
    "Signal",
    budget.evidenceItemCount,
    budget.evidenceItemMaxChars,
  );
  const closeText = trimTextToBudget(
    plan.bridgeToNext || plan.transitionFromPrevious || subtitle || thesis,
    budget.closeMaxChars,
    14,
    subtitle || thesis,
  );

  return {
    width: SLIDE_SCENE_WIDTH,
    height: SLIDE_SCENE_HEIGHT,
    background: palette.background,
    objects: [
      createRectangleObject({
        id: `${page.id}-wash`,
        x: 1040,
        y: 0,
        w: 560,
        h: 900,
        fill: palette.wash,
        opacity: 0.62,
        radius: 0,
        zIndex: 0,
      }),
      createTextObject({
        id: `${page.id}-chapter`,
        x: 88,
        y: 64,
        w: 260,
        h: 18,
        text: eyebrow,
        color: palette.accent,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 2.2,
        uppercase: true,
      }),
      createTextObject({
        id: `${page.id}-title`,
        x: 88,
        y: 98,
        w: 920,
        h: 72,
        text: title,
        color: palette.text,
        fontSize: title.length > 56 ? 38 : 44,
        fontWeight: 700,
        lineHeight: 1.05,
      }),
      ...(showSubtitle
        ? [
            createTextObject({
              id: `${page.id}-subtitle`,
              x: 88,
              y: 180,
              w: 860,
              h: 38,
              text: subtitle,
              color: palette.muted,
              fontSize: 18,
              fontWeight: 520,
              lineHeight: 1.24,
            }),
          ]
        : []),
      createTextObject({
        id: `${page.id}-thesis`,
        x: 88,
        y: showSubtitle ? 238 : 190,
        w: 860,
        h: 122,
        text: thesis,
        color: palette.text,
        fontSize: thesis.length > 96 ? 27 : 32,
        fontWeight: 620,
        lineHeight: 1.15,
      }),
      createLineObject({
        id: `${page.id}-divider`,
        x: 88,
        y: showSubtitle ? 376 : 330,
        w: 860,
        stroke: palette.line,
        strokeWidth: 2,
      }),
      createDataObject({
        id: `${page.id}-support`,
        x: 88,
        y: showSubtitle ? 406 : 360,
        w: 760,
        h: 250,
        title: undefined,
        items: supportingItems,
        appearance: "list",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createDataObject({
        id: `${page.id}-evidence`,
        x: 1008,
        y: 190,
        w: 480,
        h: 338,
        title: undefined,
        body: undefined,
        items: evidenceItems,
        appearance: "plain",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createTextObject({
        id: `${page.id}-close`,
        x: 88,
        y: 724,
        w: 1240,
        h: 58,
        text: closeText,
        color: palette.text,
        fontSize: 18,
        fontWeight: 560,
        lineHeight: 1.2,
      }),
    ],
  };
}

function buildPriorityRailScene(args: {
  page: LayoutPage;
  pageDraft: PageDraft;
  plan: GenerationDesignPlan;
  pageArchetype: GenerationPageArchetypeDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
}) {
  const { page, plan } = args;
  const palette = paletteForTemplate({
    role: page.storyPagePlan?.pageRole,
    templateSkill: args.templateSkill,
  });
  const budget = args.pageArchetype.copyBudget;
  const title = trimTextToBudget(page.title, budget.headlineMaxChars, 14, "Untitled page");
  const thesis = trimTextToBudget(plan.keyClaim, budget.thesisMaxChars, 18, title);
  const support = toBudgetedSceneItems(
    plan.supportingPoints,
    "Priority",
    budget.supportingPointCount,
    budget.supportingPointMaxChars,
  );
  const evidence = toBudgetedSceneItems(
    plan.evidenceNotes.length ? plan.evidenceNotes : [plan.objective],
    "Condition",
    budget.evidenceItemCount,
    budget.evidenceItemMaxChars,
  );
  const closeText = trimTextToBudget(
    plan.bridgeToNext || plan.transitionFromPrevious || plan.objective,
    budget.closeMaxChars,
    13,
    plan.objective,
  );

  return {
    width: SLIDE_SCENE_WIDTH,
    height: SLIDE_SCENE_HEIGHT,
    background: palette.background,
    objects: [
      createRectangleObject({
        id: `${page.id}-wash`,
        x: 0,
        y: 0,
        w: 1600,
        h: 130,
        fill: palette.wash,
        opacity: 0.28,
        radius: 0,
        zIndex: 0,
      }),
      createTextObject({
        id: `${page.id}-title`,
        x: 88,
        y: 72,
        w: 980,
        h: 68,
        text: title,
        color: palette.text,
        fontSize: title.length > 54 ? 38 : 44,
        fontWeight: 700,
        lineHeight: 1.06,
      }),
      createTextObject({
        id: `${page.id}-thesis`,
        x: 88,
        y: 176,
        w: 780,
        h: 90,
        text: thesis,
        color: palette.text,
        fontSize: thesis.length > 84 ? 26 : 30,
        fontWeight: 610,
        lineHeight: 1.14,
      }),
      createDataObject({
        id: `${page.id}-priority-stack`,
        x: 88,
        y: 298,
        w: 760,
        h: 346,
        title: "Priority order",
        items: support,
        appearance: "list",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createDataObject({
        id: `${page.id}-execution-rail`,
        x: 930,
        y: 230,
        w: 570,
        h: 414,
        title: "Execution focus",
        body: trimTextToBudget(plan.objective, 84, 12, ""),
        items: evidence,
        appearance: "panel",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createLineObject({
        id: `${page.id}-footer-line`,
        x: 88,
        y: 710,
        w: 1424,
        stroke: palette.line,
        strokeWidth: 2,
      }),
      createTextObject({
        id: `${page.id}-close`,
        x: 88,
        y: 742,
        w: 1280,
        h: 54,
        text: closeText,
        color: palette.text,
        fontSize: 18,
        fontWeight: 560,
        lineHeight: 1.2,
      }),
    ],
  };
}

function buildVerdictComparisonScene(args: {
  page: LayoutPage;
  pageDraft: PageDraft;
  plan: GenerationDesignPlan;
  pageArchetype: GenerationPageArchetypeDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
}) {
  const { page, plan } = args;
  const palette = paletteForTemplate({
    role: page.storyPagePlan?.pageRole,
    templateSkill: args.templateSkill,
  });
  const budget = args.pageArchetype.copyBudget;
  const title = trimTextToBudget(page.title, budget.headlineMaxChars, 14, "Untitled page");
  const verdict = trimTextToBudget(plan.keyClaim, budget.thesisMaxChars, 16, title);
  const leftItems = toBudgetedSceneItems(
    plan.supportingPoints.slice(0, 2),
    "Lead",
    2,
    budget.supportingPointMaxChars,
  );
  const rightItems = toBudgetedSceneItems(
    (plan.evidenceNotes.length ? plan.evidenceNotes : plan.supportingPoints.slice(2)).slice(0, 2),
    "Trade-off",
    2,
    budget.evidenceItemMaxChars,
  );
  const closeText = trimTextToBudget(
    plan.bridgeToNext || plan.transitionFromPrevious || plan.objective,
    budget.closeMaxChars,
    12,
    plan.objective,
  );

  return {
    width: SLIDE_SCENE_WIDTH,
    height: SLIDE_SCENE_HEIGHT,
    background: palette.background,
    objects: [
      createTextObject({
        id: `${page.id}-title`,
        x: 88,
        y: 76,
        w: 960,
        h: 68,
        text: title,
        color: palette.text,
        fontSize: title.length > 56 ? 38 : 44,
        fontWeight: 700,
        lineHeight: 1.06,
      }),
      createTextObject({
        id: `${page.id}-verdict`,
        x: 88,
        y: 174,
        w: 1160,
        h: 78,
        text: verdict,
        color: palette.text,
        fontSize: verdict.length > 88 ? 26 : 30,
        fontWeight: 620,
        lineHeight: 1.14,
      }),
      createDataObject({
        id: `${page.id}-lead-case`,
        x: 88,
        y: 304,
        w: 668,
        h: 300,
        title: "Leading case",
        items: leftItems,
        appearance: "panel",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createDataObject({
        id: `${page.id}-tradeoffs`,
        x: 804,
        y: 338,
        w: 620,
        h: 266,
        title: "Trade-offs to manage",
        items: rightItems,
        appearance: "plain",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createRectangleObject({
        id: `${page.id}-accent`,
        x: 88,
        y: 304,
        w: 668,
        h: 8,
        fill: palette.accent,
        radius: 8,
        zIndex: 4,
      }),
      createTextObject({
        id: `${page.id}-close`,
        x: 88,
        y: 702,
        w: 1260,
        h: 54,
        text: closeText,
        color: palette.text,
        fontSize: 18,
        fontWeight: 560,
        lineHeight: 1.2,
      }),
    ],
  };
}

function buildChartInsightScene(args: {
  page: LayoutPage;
  pageDraft: PageDraft;
  plan: GenerationDesignPlan;
  pageArchetype: GenerationPageArchetypeDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
}) {
  const { page, plan } = args;
  const chartSeries = buildChartSeriesFromPlan(plan);
  if (chartSeries.length < 3) {
    return buildHeroRailScene(args);
  }

  const palette = paletteForTemplate({
    role: page.storyPagePlan?.pageRole,
    templateSkill: args.templateSkill,
  });
  const budget = args.pageArchetype.copyBudget;
  const title = trimTextToBudget(page.title, budget.headlineMaxChars, 14, "Untitled page");
  const thesis = trimTextToBudget(plan.keyClaim, budget.thesisMaxChars, 15, title);
  const insights = toBudgetedSceneItems(
    plan.evidenceNotes.length ? plan.evidenceNotes : plan.supportingPoints,
    "Insight",
    budget.evidenceItemCount,
    budget.evidenceItemMaxChars,
  );
  const closeText = trimTextToBudget(
    plan.bridgeToNext || plan.transitionFromPrevious || plan.objective,
    budget.closeMaxChars,
    12,
    plan.objective,
  );

  return {
    width: SLIDE_SCENE_WIDTH,
    height: SLIDE_SCENE_HEIGHT,
    background: palette.background,
    objects: [
      createTextObject({
        id: `${page.id}-title`,
        x: 88,
        y: 72,
        w: 980,
        h: 64,
        text: title,
        color: palette.text,
        fontSize: title.length > 54 ? 38 : 44,
        fontWeight: 700,
        lineHeight: 1.06,
      }),
      createTextObject({
        id: `${page.id}-thesis`,
        x: 88,
        y: 166,
        w: 920,
        h: 72,
        text: thesis,
        color: palette.text,
        fontSize: thesis.length > 86 ? 24 : 28,
        fontWeight: 610,
        lineHeight: 1.16,
      }),
      createChartObject({
        id: `${page.id}-chart`,
        x: 88,
        y: 278,
        w: 920,
        h: 366,
        title: "Pattern view",
        body: "Show the relationship, then annotate the shifts that matter.",
        series: chartSeries.map((item, index) => ({
          ...item,
          color: index === chartSeries.length - 1 ? palette.chartPrimary : palette.chartSecondary,
        })),
        appearance: "minimal",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createDataObject({
        id: `${page.id}-insights`,
        x: 1054,
        y: 252,
        w: 446,
        h: 392,
        title: "What the pattern says",
        items: insights,
        appearance: "plain",
        fill: palette.surface,
        stroke: palette.line,
        strokeWidth: 1,
        radius: 24,
        color: palette.text,
      }),
      createTextObject({
        id: `${page.id}-close`,
        x: 88,
        y: 718,
        w: 1280,
        h: 52,
        text: closeText,
        color: palette.text,
        fontSize: 18,
        fontWeight: 560,
        lineHeight: 1.2,
      }),
    ],
  };
}

export function buildFallbackPageScene(args: {
  page: LayoutPage;
  pageDraft: PageDraft;
}) {
  const { page, pageDraft } = args;
  const plan = buildFallbackPlan(page, pageDraft);
  const presentation = resolveFallbackPresentationContext({
    page,
    plan,
  });

  switch (presentation.pageArchetype.id) {
    case "priority-rail":
      return buildPriorityRailScene({
        page,
        pageDraft,
        plan,
        pageArchetype: presentation.pageArchetype,
        templateSkill: presentation.templateSkill,
      });
    case "verdict-comparison":
      return buildVerdictComparisonScene({
        page,
        pageDraft,
        plan,
        pageArchetype: presentation.pageArchetype,
        templateSkill: presentation.templateSkill,
      });
    case "chart-insight":
      return buildChartInsightScene({
        page,
        pageDraft,
        plan,
        pageArchetype: presentation.pageArchetype,
        templateSkill: presentation.templateSkill,
      });
    case "hero-rail":
    default:
      return buildHeroRailScene({
        page,
        pageDraft,
        plan,
        pageArchetype: presentation.pageArchetype,
        templateSkill: presentation.templateSkill,
      });
  }
}

export function resolvePageScene(args: {
  page: LayoutPage;
  pageDraft: PageDraft;
}) {
  const fallbackPlan = buildFallbackPlan(args.page, args.pageDraft);
  const presentation = resolveFallbackPresentationContext({
    page: args.page,
    plan: fallbackPlan,
  });
  if (
    args.pageDraft.scene &&
    !hasSceneDesignFailure(
      evaluateSceneDesignIssues({
        scene: args.pageDraft.scene,
        plan: fallbackPlan,
        pageTitle: args.page.title,
        pageNote: args.page.note,
        pageArchetype: presentation.pageArchetype,
        templateSkill: presentation.templateSkill,
      }),
    ) &&
    !sceneNeedsFallback({
      scene: args.pageDraft.scene,
      plan: fallbackPlan,
      pageTitle: args.page.title,
      pageNote: args.page.note,
    })
  ) {
    return args.pageDraft.scene;
  }
  return buildFallbackPageScene(args);
}
