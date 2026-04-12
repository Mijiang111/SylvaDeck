import {
  toGeneratedReportStyleProfile,
  type DeckStyleProfile,
} from "../industry-style.js";
import type {
  ChartSpec,
  GeneratedReportStyleProfile,
  PageRecipe,
} from "./contracts.js";
import {
  assessGeneratedTitleQuality,
  compactBoardTitle,
  deriveEvidenceTitle,
  splitBriefLines,
  stripInstructionalLead,
} from "./brief.js";

function stripCodeFences(text: string) {
  return text
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractHtmlDocument(text: string) {
  const cleaned = stripCodeFences(text);
  const doctypeIndex = cleaned.search(/<!DOCTYPE html>/i);
  const htmlIndex = cleaned.search(/<html[\s>]/i);
  const startIndex = doctypeIndex >= 0 ? doctypeIndex : htmlIndex >= 0 ? htmlIndex : 0;
  const endMatch = cleaned.match(/<\/html>\s*$/i);
  if (!endMatch) {
    return cleaned.slice(startIndex).trim();
  }
  return cleaned.slice(startIndex, endMatch.index! + endMatch[0].length).trim();
}

export function extractJsonDocument(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = text.indexOf("{");
  const lastBraceIndex = text.lastIndexOf("}");
  if (firstBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
    return "";
  }

  return text.slice(firstBraceIndex, lastBraceIndex + 1).trim();
}

export function extractTextBeforeHtml(text: string) {
  const doctypeIndex = text.search(/<!DOCTYPE html>/i);
  const htmlIndex = text.search(/<html[\s>]/i);
  const startIndex = doctypeIndex >= 0 ? doctypeIndex : htmlIndex >= 0 ? htmlIndex : -1;
  if (startIndex < 0) {
    return text.trim();
  }

  return text.slice(0, startIndex).replace(/```(?:html)?/gi, "").trim();
}

export function extractTextBeforeJson(text: string) {
  const fencedIndex = text.search(/```json/i);
  const firstBraceIndex = text.indexOf("{");
  const startIndex =
    fencedIndex >= 0
      ? fencedIndex
      : firstBraceIndex >= 0
        ? firstBraceIndex
        : -1;
  if (startIndex < 0) {
    return text.trim();
  }

  return text.slice(0, startIndex).replace(/```/g, "").trim();
}

export function extractPageTitles(html: string) {
  const matches = html.matchAll(
    /<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*data-page-title=["']([^"']+)["'][^>]*>/gi,
  );
  return Array.from(matches, (match) => match[1]?.trim()).filter(Boolean);
}

export function extractDocumentTitle(html: string) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]?.trim()) {
    return h1Match[1].replace(/<[^>]+>/g, "").trim();
  }
  return "Generated studio report";
}

export function replaceDocumentTitle(html: string, title: string) {
  const titleTag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${titleTag}`);
  }

  return html;
}

export function countPages(html: string) {
  return Array.from(
    html.matchAll(/<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>/gi),
  ).length;
}

const promptScaffoldLeakPatterns: Array<[RegExp, string]> = [
  [
    /\b(?:raw brief|ai understanding|visual thinking|active capability cards|user task brief|task rigor brief|renderer brief|proof plan|layout strategy|source material|selected template contract|capability cards|output rules|page argument contract|deck planning intent)\b/i,
    "workspace block label",
  ],
  [
    /\b(?:headline claim|support bullets?|evidence callouts?|evidence bullets?|page evidence bundle|brief digest|current page (?:goal|story|intent|objective)|page question)\s*:/i,
    "page contract label",
  ],
  [/\bsupport bullet\s*\d+\b/i, "support bullet scaffold label"],
  [/\bone-page thesis\b/i, "one-page thesis scaffold label"],
  [/\bselected deep family\b/i, "deep layout scaffold label"],
  [/\bthis page must answer exactly one\b/i, "page argument instruction"],
  [/\bat most\s+2\s+short\s+(?:bullets|callouts)\b/i, "copy-budget instruction"],
  [/\b(?:using|tied to|based on)\s+the supplied brief\b/i, "supplied brief instruction"],
];

function decodeBasicHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractVisibleTextForLeakCheck(html: string) {
  return decodeBasicHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function detectPromptScaffoldLeak(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const match = promptScaffoldLeakPatterns.find(([pattern]) => pattern.test(normalized));
  return match?.[1] ?? null;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type DeterministicRenderTheme = {
  profileId: string;
  label: string;
  pageBackground: string;
  bodyBackground: string;
  surfacePrimary: string;
  surfaceSecondary: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  borderSubtle: string;
  chartPalette: string[];
};

function withHexAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function resolveDeterministicRenderTheme(profile: DeckStyleProfile): DeterministicRenderTheme {
  return {
    profileId: profile.id,
    label: profile.label,
    pageBackground: profile.tokens.pageBackground,
    bodyBackground: profile.tokens.bodyBackground,
    surfacePrimary: profile.tokens.surfacePrimary,
    surfaceSecondary: profile.tokens.surfaceSecondary,
    textPrimary: profile.tokens.textPrimary,
    textMuted: profile.tokens.textMuted,
    accentPrimary: profile.tokens.accentPrimary,
    accentSecondary: profile.tokens.accentSecondary,
    borderSubtle: profile.tokens.borderSubtle,
    chartPalette: profile.tokens.chartPalette,
  };
}

function decorateSectionWithStyleMetadata(sectionHtml: string, styleProfile: GeneratedReportStyleProfile) {
  return sectionHtml.replace(
    /<section\b([^>]*)>/i,
    (match) => {
      let next = match;
      const attrs = [
        ["data-page-bg", styleProfile.pageBackground],
        ["data-divider-color", styleProfile.dividerColor],
        ["data-surface-fill", styleProfile.surfaceFill],
        ["data-page-accent", styleProfile.accentColor],
        ["data-style-profile-id", styleProfile.id],
        ["data-export-page-bg", styleProfile.pageBackground],
        ["data-export-divider-color", styleProfile.dividerColor],
        ["data-export-surface-fill", styleProfile.surfaceFill],
        ["data-export-accent", styleProfile.accentColor],
      ] as const;

      for (const [name, value] of attrs) {
        if (new RegExp(`${name}=["']`, "i").test(next)) {
          continue;
        }
        next = next.replace(/>$/, ` ${name}="${escapeHtml(value)}">`);
      }

      return next;
    },
  );
}

function decorateDeckHtmlWithStyleProfile(html: string, styleProfile: GeneratedReportStyleProfile) {
  const withBodyMetadata = html.replace(/<body\b([^>]*)>/i, (match) => {
    let next = match;
    if (!/data-style-profile-id=["']/i.test(next)) {
      next = next.replace(/>$/, ` data-style-profile-id="${escapeHtml(styleProfile.id)}">`);
    }
    return next;
  });

  return withBodyMetadata.replace(
    /<section\b[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
    (sectionHtml) => decorateSectionWithStyleMetadata(sectionHtml, styleProfile),
  );
}

export function extractSinglePageSection(html: string) {
  const sectionMatch = html.match(
    /<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>[\s\S]*?<\/section>/i,
  );
  if (!sectionMatch?.[0]) {
    throw new Error("The generated page did not contain a <section class=\"page\"> block.");
  }

  return sectionMatch[0].trim();
}

export function validateGeneratedPageHtml(args: {
  html: string;
  expectedPageNumber: number;
  expectedPageTitle: string;
}) {
  const cleanedHtml = extractHtmlDocument(args.html);
  if (!cleanedHtml || !/<(?:!DOCTYPE html|html[\s>])/i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} did not return a valid HTML document.`);
  }

  if (countPages(cleanedHtml) !== 1) {
    throw new Error(`Page ${args.expectedPageNumber} must contain exactly one slide section.`);
  }

  if (/<script[\s>]/i.test(cleanedHtml) || /<style[\s>]/i.test(cleanedHtml) || /<link[\s>]/i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} used a disallowed tag.`);
  }

  if (/<(?:img|video|audio)[^>]+src=["'](?:https?:)?\/\//i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} referenced an external asset.`);
  }

  if (/overflow\s*:\s*(?:auto|scroll)/i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} introduced scrolling content.`);
  }

  const sectionHtml = extractSinglePageSection(cleanedHtml);
  const pageTitleMatches = extractPageTitles(cleanedHtml);
  const pageTitle = pageTitleMatches[0]?.trim();
  if (!pageTitle) {
    throw new Error(`Page ${args.expectedPageNumber} is missing data-page-title.`);
  }
  const pageTitleQuality = assessGeneratedTitleQuality(pageTitle);
  if (
    pageTitleQuality.promptLeak ||
    pageTitleQuality.repeatedInstruction ||
    pageTitleQuality.truncated
  ) {
    throw new Error(
      `Page ${args.expectedPageNumber} returned a weak or leaked title: "${pageTitle}".`,
    );
  }

  const pageNumberMatch = sectionHtml.match(/data-page-number=["'](\d+)["']/i);
  const pageNumber = Number.parseInt(pageNumberMatch?.[1] ?? "", 10);
  if (!Number.isInteger(pageNumber) || pageNumber !== args.expectedPageNumber) {
    throw new Error(`Page ${args.expectedPageNumber} returned an unexpected data-page-number.`);
  }

  if (!sectionHtml.includes("1600px") || !sectionHtml.includes("900px")) {
    throw new Error(`Page ${args.expectedPageNumber} is missing the required 1600×900 sizing.`);
  }

  const headingMatch = cleanedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const headingText = headingMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  if (headingText) {
    const headingQuality = assessGeneratedTitleQuality(headingText);
    if (
      headingQuality.promptLeak ||
      headingQuality.repeatedInstruction ||
      headingQuality.truncated
    ) {
      throw new Error(
        `Page ${args.expectedPageNumber} rendered a weak or leaked heading: "${headingText}".`,
      );
    }
  }

  const promptScaffoldLeak = detectPromptScaffoldLeak(
    extractVisibleTextForLeakCheck(sectionHtml),
  );
  if (promptScaffoldLeak) {
    throw new Error(
      `Page ${args.expectedPageNumber} rendered workspace scaffolding as visible text: ${promptScaffoldLeak}.`,
    );
  }

  return {
    pageTitle,
    pageHtml: cleanedHtml,
    sectionHtml,
  };
}

export function composeDeckHtml(args: {
  title: string;
  sections: string[];
  styleProfile?: GeneratedReportStyleProfile;
}) {
  const bodyBackground = args.styleProfile?.pageBackground ?? "#efe7dc";
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(args.title)}</title>`,
    "</head>",
    `<body style="margin:0;background:${escapeHtml(bodyBackground)};">`,
    args.sections.join("\n"),
    "</body>",
    "</html>",
  ].join("\n");
}

export function resolveSanitizedDeckTitle(args: {
  deckTitle: string;
  brief: string;
  pageTitles: string[];
  fallbackTitle?: string;
}) {
  const deckTitleQuality = assessGeneratedTitleQuality(args.deckTitle);
  if (
    deckTitleQuality.title.length >= 8 &&
    !deckTitleQuality.promptLeak &&
    !deckTitleQuality.repeatedInstruction &&
    !deckTitleQuality.truncated
  ) {
    return deckTitleQuality.title;
  }

  for (const pageTitle of args.pageTitles) {
    const pageTitleQuality = assessGeneratedTitleQuality(pageTitle);
    if (
      pageTitleQuality.title.length >= 8 &&
      !pageTitleQuality.promptLeak &&
      !pageTitleQuality.repeatedInstruction &&
      !pageTitleQuality.truncated
    ) {
      return pageTitleQuality.title;
    }
  }

  const briefSeed =
    splitBriefLines(args.brief).find((line) => stripInstructionalLead(line).length > 0) ??
    stripInstructionalLead(args.brief) ??
    args.fallbackTitle ??
    args.deckTitle;
  const compactedFallback = compactBoardTitle(
    deriveEvidenceTitle(briefSeed, args.fallbackTitle ?? "Generated studio report"),
    args.fallbackTitle ?? "Generated studio report",
    7,
  );
  const compactedQuality = assessGeneratedTitleQuality(compactedFallback);
  return compactedQuality.title || args.fallbackTitle || "Generated studio report";
}

export function buildSanitizedFinalReport(args: {
  html: string;
  brief: string;
  fallbackTitle?: string;
  styleProfile?: GeneratedReportStyleProfile;
}) {
  const styledHtml = args.styleProfile
    ? decorateDeckHtmlWithStyleProfile(args.html, args.styleProfile)
    : args.html;
  const rawPageTitles = extractPageTitles(styledHtml);
  const safeTitle = resolveSanitizedDeckTitle({
    deckTitle: extractDocumentTitle(styledHtml),
    brief: args.brief,
    pageTitles: rawPageTitles,
    fallbackTitle: args.fallbackTitle,
  });
  const html = replaceDocumentTitle(styledHtml, safeTitle);

  return {
    title: safeTitle,
    html,
    pageCount: countPages(html),
    pageTitles: extractPageTitles(html),
    styleProfileId: args.styleProfile?.id,
    styleProfile: args.styleProfile,
  };
}

function renderListItems(items: string[], theme: DeterministicRenderTheme, accent = theme.textPrimary) {
  return items
    .map(
      (item) =>
        `<li style="margin:0 0 10px 0;color:${accent};font-size:24px;line-height:1.45;">${escapeHtml(
          item,
        )}</li>`,
    )
    .join("");
}

function renderMetricStrip(items: string[], theme: DeterministicRenderTheme) {
  return `<div data-html-visual-kind="rail" style="display:grid;grid-template-columns:repeat(${Math.max(
    2,
    Math.min(items.length, 4),
  )}, minmax(0,1fr));gap:18px;margin-top:28px;">${items
    .slice(0, 4)
    .map(
      (item, index) =>
        `<div data-html-visual-kind="surface" style="border:1px solid ${withHexAlpha(
          theme.borderSubtle,
          0.9,
        )};border-radius:22px;background:${theme.surfaceSecondary};padding:20px 22px;min-height:108px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:12px;">Signal ${index + 1}</div><div style="font-size:22px;line-height:1.35;color:${theme.textPrimary};">${escapeHtml(
          item,
        )}</div></div>`,
    )
    .join("")}</div>`;
}

function renderBarChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const maxValue = Math.max(...spec.series[0]!.values.map((value) => Math.abs(value)), 1);
  const barWidth = 96;
  const gap = 40;
  const baseline = 300;
  return `<svg viewBox="0 0 820 360" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <line x1="48" y1="${baseline}" x2="772" y2="${baseline}" stroke="${theme.borderSubtle}" stroke-width="1" />
    ${spec.categories
      .map((category, index) => {
        const value = spec.series[0]!.values[index] ?? 0;
        const height = Math.max(8, Math.abs(value) / maxValue * 210);
        const x = 72 + index * (barWidth + gap);
        const y = value >= 0 ? baseline - height : baseline;
        const color =
          spec.series[0]!.color ??
          (value >= 0 ? theme.chartPalette[0] ?? theme.accentPrimary : theme.chartPalette[2] ?? theme.accentSecondary);
        return `<g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="14" fill="${color}" />
          <text x="${x + barWidth / 2}" y="${baseline + 28}" text-anchor="middle" font-size="14" fill="${theme.textMuted}">${escapeHtml(
            category,
          )}</text>
          <text x="${x + barWidth / 2}" y="${y - 12}" text-anchor="middle" font-size="14" fill="${theme.textPrimary}">${escapeHtml(
            String(value),
          )}</text>
        </g>`;
      })
      .join("")}
  </svg>`;
}

function renderLineChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const values = spec.series[0]!.values;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(1, maxValue - minValue);
  const stepX = values.length > 1 ? 640 / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = 80 + index * stepX;
    const y = 280 - ((value - minValue) / range) * 180;
    return { x, y, value };
  });

  return `<svg viewBox="0 0 820 360" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <line x1="56" y1="292" x2="772" y2="292" stroke="${theme.borderSubtle}" stroke-width="1" />
    <polyline fill="none" stroke="${spec.series[0]!.color ?? theme.chartPalette[0] ?? theme.accentPrimary}" stroke-width="4" points="${points
      .map((point) => `${point.x},${point.y}`)
      .join(" ")}" />
    ${points
      .map(
        (point, index) =>
          `<g>
            <circle cx="${point.x}" cy="${point.y}" r="7" fill="${spec.series[0]!.color ?? theme.chartPalette[0] ?? theme.accentPrimary}" />
            <text x="${point.x}" y="320" text-anchor="middle" font-size="14" fill="${theme.textMuted}">${escapeHtml(
              spec.categories[index] ?? "",
            )}</text>
            <text x="${point.x}" y="${point.y - 14}" text-anchor="middle" font-size="14" fill="${theme.textPrimary}">${escapeHtml(
              String(point.value),
            )}</text>
          </g>`,
      )
      .join("")}
  </svg>`;
}

function renderStackedChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const totals = spec.categories.map((_, index) =>
    spec.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0),
  );
  const maxTotal = Math.max(...totals, 1);
  const colors = theme.chartPalette.length
    ? theme.chartPalette
    : [theme.accentPrimary, theme.accentSecondary, theme.surfaceSecondary, theme.textMuted];

  return `<svg viewBox="0 0 820 360" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <line x1="48" y1="300" x2="772" y2="300" stroke="${theme.borderSubtle}" stroke-width="1" />
    ${spec.categories
      .map((category, categoryIndex) => {
        const x = 86 + categoryIndex * 180;
        let cursorY = 300;
        const segments = spec.series
          .map((series, seriesIndex) => {
            const value = series.values[categoryIndex] ?? 0;
            const height = Math.max(10, (value / maxTotal) * 220);
            cursorY -= height;
            return `<rect x="${x}" y="${cursorY}" width="92" height="${height}" rx="12" fill="${series.color ?? colors[seriesIndex % colors.length]}" />`;
          })
          .join("");

        return `<g>${segments}<text x="${x + 46}" y="328" text-anchor="middle" font-size="14" fill="${theme.textMuted}">${escapeHtml(
          category,
        )}</text><text x="${x + 46}" y="${cursorY - 12}" text-anchor="middle" font-size="14" fill="${theme.textPrimary}">${escapeHtml(
          String(totals[categoryIndex]),
        )}</text></g>`;
      })
      .join("")}
  </svg>`;
}

function renderChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  if (spec.kind === "line") {
    return renderLineChartSvg(spec, theme);
  }
  if (spec.kind === "stacked") {
    return renderStackedChartSvg(spec, theme);
  }
  return renderBarChartSvg(spec, theme);
}

function renderChartPanel(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  if (!recipe.chartSpec) {
    return "";
  }

  const legend = recipe.chartSpec.series
    .map(
      (series, index) =>
        `<div style="display:flex;align-items:center;gap:10px;"><span style="width:12px;height:12px;border-radius:999px;background:${series.color ?? theme.chartPalette[index % Math.max(theme.chartPalette.length, 1)] ?? theme.accentPrimary};display:inline-block;"></span><span>${escapeHtml(
          series.name,
        )}</span></div>`,
    )
    .join("");

  return `<div data-html-visual-kind="chart-frame" data-export-chart="${escapeHtml(
    JSON.stringify({
      kind: recipe.chartSpec.kind,
      categories: recipe.chartSpec.categories,
      series: recipe.chartSpec.series,
      title: recipe.chartSpec.title,
      unit: recipe.chartSpec.unit,
    }),
  )}" style="border:1px solid ${withHexAlpha(
    theme.borderSubtle,
    0.9,
  )};border-radius:30px;background:${theme.surfacePrimary};padding:26px 28px;min-height:430px;display:flex;flex-direction:column;gap:18px;">
    <div>
      <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Primary chart</div>
      <h3 style="margin:0;font-size:34px;line-height:1.12;color:${theme.textPrimary};">${escapeHtml(
        recipe.chartSpec.title,
      )}</h3>
    </div>
    <div style="flex:1;min-height:280px;">${renderChartSvg(recipe.chartSpec, theme)}</div>
    <div style="display:flex;justify-content:space-between;gap:20px;font-size:15px;color:${theme.textMuted};">
      <div style="display:flex;gap:18px;flex-wrap:wrap;">${legend}</div>
      <div>Unit: ${escapeHtml(recipe.chartSpec.unit)}</div>
    </div>
  </div>`;
}

function renderHeroProofSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return `<div data-page-body style="display:grid;grid-template-columns: minmax(0,1.35fr) minmax(320px,0.85fr);gap:28px;align-items:start;">
    <div data-html-layout-key="hero-left" style="display:flex;flex-direction:column;gap:22px;">
      <div>
        <h1 style="margin:0 0 18px 0;font-size:58px;line-height:0.98;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
          recipe.heroClaim,
        )}</h1>
        <p style="margin:0;font-size:25px;line-height:1.45;color:${theme.textMuted};">${escapeHtml(
          recipe.objective,
        )}</p>
      </div>
      <div data-html-visual-kind="surface" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:30px;background:${theme.surfacePrimary};padding:28px 30px;">
        <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:14px;">Supporting logic</div>
        <ul style="margin:0;padding-left:24px;">${renderListItems(recipe.supportBullets, theme)}</ul>
      </div>
      ${recipe.chartSpec && recipe.chartSpec.composite === "metric-strip" ? renderMetricStrip(recipe.evidenceBullets, theme) : ""}
    </div>
    <aside data-html-layout-key="hero-right" style="display:flex;flex-direction:column;gap:18px;">
      ${(recipe.chartSpec && recipe.chartSpec.composite !== "metric-strip"
        ? [renderChartPanel(recipe, theme)]
        : recipe.evidenceBullets.slice(0, 3).map(
            (item, index) =>
              `<div data-html-visual-kind="${index === 0 ? "highlight" : "surface"}" style="border:1px solid ${withHexAlpha(
                theme.borderSubtle,
                0.85,
              )};border-radius:26px;background:${index === 0 ? theme.surfaceSecondary : theme.surfacePrimary};padding:24px 24px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Evidence ${index + 1}</div><div style="font-size:24px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
                item,
              )}</div></div>`,
          ))
        .join("")}
      <div data-html-visual-kind="rail" style="border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.95)};padding-top:18px;font-size:22px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>
    </aside>
  </div>`;
}

function renderChartInsightSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return `<div data-page-body style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,0.85fr);gap:26px;align-items:start;">
    <div data-html-layout-key="chart-left" style="display:flex;flex-direction:column;gap:18px;">
      ${renderChartPanel(recipe, theme)}
      ${recipe.chartSpec?.composite === "metric-strip" ? renderMetricStrip(recipe.evidenceBullets, theme) : ""}
      ${recipe.chartSpec?.composite === "decision-footer" ? `<div data-html-visual-kind="annotation" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:24px;background:${theme.surfaceSecondary};padding:22px 24px;font-size:24px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>` : ""}
    </div>
    <aside data-html-layout-key="chart-right" style="display:flex;flex-direction:column;gap:16px;">
      <div data-html-visual-kind="badge" style="display:inline-flex;align-self:flex-start;padding:10px 16px;border-radius:999px;border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};background:${theme.surfacePrimary};font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};">Data-driven view</div>
      <h2 style="margin:0;font-size:34px;line-height:1.08;color:${theme.textPrimary};">${escapeHtml(recipe.heroClaim)}</h2>
      <ul style="margin:0;padding-left:24px;">${renderListItems(recipe.supportBullets.slice(0, 3), theme)}</ul>
      <div data-html-visual-kind="rail" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:24px;background:${theme.surfaceSecondary};padding:20px 22px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Decision</div><div style="font-size:24px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div></div>
    </aside>
  </div>`;
}

function renderSequenceSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return `<div data-page-body style="display:flex;flex-direction:column;gap:24px;">
    <div>
      <h1 style="margin:0 0 14px 0;font-size:54px;line-height:0.98;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
        recipe.heroClaim,
      )}</h1>
      <p style="margin:0;font-size:24px;line-height:1.45;color:${theme.textMuted};">${escapeHtml(
        recipe.objective,
      )}</p>
    </div>
    <div data-html-layout-key="sequence" style="display:grid;grid-template-columns:repeat(${Math.max(
      3,
      Math.min(recipe.supportBullets.length, 4),
    )}, minmax(0,1fr));gap:18px;">
      ${recipe.supportBullets
        .slice(0, 4)
        .map(
          (item, index) =>
            `<div data-html-visual-kind="surface" style="border:1px solid ${withHexAlpha(
              theme.borderSubtle,
              0.9,
            )};border-radius:28px;background:${theme.surfacePrimary};padding:22px 24px;min-height:180px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:18px;">Step ${index + 1}</div><div style="font-size:26px;line-height:1.38;color:${theme.textPrimary};">${escapeHtml(
              item,
            )}</div></div>`,
        )
        .join("")}
    </div>
    <div data-html-visual-kind="rail" style="font-size:23px;line-height:1.42;color:${theme.textPrimary};border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.95)};padding-top:16px;">${escapeHtml(
      recipe.takeaway,
    )}</div>
  </div>`;
}

function renderComparisonSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  const comparisonItems = recipe.evidenceBullets.length
    ? recipe.evidenceBullets
    : recipe.supportBullets;

  return `<div data-page-body style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,0.8fr);gap:24px;align-items:start;">
    <div data-html-layout-key="comparison-left" style="display:flex;flex-direction:column;gap:18px;">
      <div>
        <h1 style="margin:0 0 14px 0;font-size:54px;line-height:0.98;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
          recipe.heroClaim,
        )}</h1>
        <p style="margin:0;font-size:24px;line-height:1.45;color:${theme.textMuted};">${escapeHtml(
          recipe.objective,
        )}</p>
      </div>
      ${recipe.chartSpec ? renderChartPanel(recipe, theme) : renderMetricStrip(comparisonItems, theme)}
    </div>
    <aside data-html-layout-key="comparison-right" style="display:flex;flex-direction:column;gap:16px;">
      ${comparisonItems
        .slice(0, 4)
        .map(
          (item, index) =>
            `<div data-html-visual-kind="${index === 0 ? "highlight" : "surface"}" style="border:1px solid ${withHexAlpha(
              theme.borderSubtle,
              0.85,
            )};border-radius:24px;background:${index === 0 ? theme.surfaceSecondary : theme.surfacePrimary};padding:20px 22px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Comparison ${index + 1}</div><div style="font-size:23px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
              item,
            )}</div></div>`,
        )
        .join("")}
      <div data-html-visual-kind="annotation" style="border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.95)};padding-top:14px;font-size:22px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>
    </aside>
  </div>`;
}

export function composeDeterministicPageSection(recipe: PageRecipe, styleProfile: DeckStyleProfile) {
  const theme = resolveDeterministicRenderTheme(styleProfile);
  const moduleLabel = recipe.moduleBinding?.label ?? "Built-in renderer";
  const body =
    recipe.layout === "sequence"
      ? renderSequenceSection(recipe, theme)
      : recipe.layout === "chart-insight"
        ? renderChartInsightSection(recipe, theme)
        : recipe.layout === "comparison"
          ? renderComparisonSection(recipe, theme)
          : renderHeroProofSection(recipe, theme);

  return `<section class="page" data-page-number="${recipe.pageNumber}" data-page-title="${escapeHtml(
    recipe.pageTitle,
  )}" data-page-bg="${theme.pageBackground}" data-divider-color="${theme.borderSubtle}" data-surface-fill="${theme.surfacePrimary}" data-page-accent="${theme.accentPrimary}" data-style-profile-id="${theme.profileId}" data-export-page-bg="${theme.pageBackground}" data-export-divider-color="${theme.borderSubtle}" data-export-surface-fill="${theme.surfacePrimary}" data-export-accent="${theme.accentPrimary}" style="width:1600px;height:900px;box-sizing:border-box;padding:54px 64px;background:${theme.pageBackground};display:flex;flex-direction:column;gap:26px;font-family:Inter, system-ui, sans-serif;">
    <header data-html-layout-key="header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
      <div>
        <div style="font-size:14px;letter-spacing:0.22em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:12px;">${escapeHtml(
          recipe.pageTitle,
        )}</div>
        <div style="font-size:20px;line-height:1.4;color:${theme.textMuted};max-width:980px;">${escapeHtml(
          recipe.insight,
        )}</div>
      </div>
      <div data-html-visual-kind="badge" style="display:inline-flex;align-items:center;padding:10px 14px;border-radius:999px;border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};background:${theme.surfacePrimary};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};">${escapeHtml(
        moduleLabel,
      )}</div>
    </header>
    <main style="flex:1;display:block;">${body}</main>
  </section>`;
}

export function composeSinglePageHtml(args: {
  title: string;
  sectionHtml: string;
  styleProfile?: GeneratedReportStyleProfile;
}) {
  return composeDeckHtml({
    title: args.title,
    sections: [args.sectionHtml],
    styleProfile: args.styleProfile,
  });
}

export function extractDeckSections(html: string) {
  const sections = Array.from(
    html.matchAll(
      /<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
    ),
  ).map((match) => match[0].trim());

  return sections.map((sectionHtml, index) => {
    const pageNumberMatch = sectionHtml.match(/data-page-number=["'](\d+)["']/i);
    const pageTitleMatch = sectionHtml.match(/data-page-title=["']([^"']+)["']/i);
    return {
      pageNumber: Number.parseInt(pageNumberMatch?.[1] ?? `${index + 1}`, 10),
      pageTitle: pageTitleMatch?.[1]?.trim() || `Page ${index + 1}`,
      sectionHtml,
    };
  });
}
