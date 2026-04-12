import type {
  GenerationTemplateSkillDefinition,
  HtmlPageGrammarDefinition,
  HtmlReportThemeDefinition,
} from "./generation-contract";
import {
  applyIndustryProfileToHtmlTheme,
  getIndustryStyleProfile,
} from "./industry-style";

const HTML_REPORT_THEME_REGISTRY: HtmlReportThemeDefinition[] = [
  {
    id: "theme.consulting-editorial",
    label: "Consulting Editorial",
    summary: "Warm paper canvas, restrained navy typography, and quiet supporting surfaces for authored report pages.",
    tokens: {
      pageBackground: "#f7f3eb",
      surfacePrimary: "#fffaf1",
      surfaceSecondary: "#edf3f7",
      textPrimary: "#17283b",
      textMuted: "#617382",
      accentPrimary: "#173d57",
      borderSubtle: "#d8e3ea",
      headlineFontFamily: "\"Iowan Old Style\", Georgia, serif",
      bodyFontFamily: "\"Aptos\", \"Segoe UI\", sans-serif",
      headlineWeight: 700,
      bodyWeight: 400,
      spacingBase: 8,
      pagePadding: 72,
      gutter: 40,
      radiusLarge: 36,
      radiusSmall: 20,
    },
    typographyGuidance: [
      "Use the serif only for headline and high-importance verdict copy.",
      "Keep support copy smaller and calmer than the hero claim.",
    ],
    surfaceGuidance: [
      "Use soft paper surfaces and thin dividers rather than hard cards.",
      "Let whitespace separate ideas before adding chrome.",
    ],
    chartGuidance: [
      "Charts should feel integrated into the page rather than mounted on a dashboard panel.",
    ],
    avoidPatterns: [
      "Do not stack many same-weight cards.",
      "Do not use dark slabs unless the grammar explicitly needs one anchor surface.",
    ],
  },
  {
    id: "theme.consulting-priority",
    label: "Consulting Priority",
    summary: "A warm consulting theme with one amber ordering accent and one quiet execution rail.",
    tokens: {
      pageBackground: "#f7f3eb",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#eef3f6",
      textPrimary: "#162838",
      textMuted: "#667889",
      accentPrimary: "#c4973d",
      borderSubtle: "#dce7ed",
      headlineFontFamily: "\"Iowan Old Style\", Georgia, serif",
      bodyFontFamily: "\"Aptos\", \"Segoe UI\", sans-serif",
      headlineWeight: 700,
      bodyWeight: 400,
      spacingBase: 8,
      pagePadding: 72,
      gutter: 36,
      radiusLarge: 32,
      radiusSmall: 18,
    },
    typographyGuidance: [
      "Use clear weight differences to show rank.",
      "Keep numbered or ordered items crisp and short.",
    ],
    surfaceGuidance: [
      "Use one primary stack surface and one secondary rail surface.",
      "Avoid making all priority containers visually equal.",
    ],
    chartGuidance: [
      "Prefer ordered text clusters over charts unless rank depends on numbers.",
    ],
    avoidPatterns: [
      "Do not turn ranking into floating tiles.",
      "Do not decorate chronology when the page is really about priorities.",
    ],
  },
  {
    id: "theme.consulting-verdict",
    label: "Consulting Verdict",
    summary: "Asymmetric comparison theme with one darker lead surface and one lighter comparison side.",
    tokens: {
      pageBackground: "#f5f3ee",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#eaf1f6",
      textPrimary: "#18273a",
      textMuted: "#667889",
      accentPrimary: "#173d57",
      borderSubtle: "#d9e3ea",
      headlineFontFamily: "\"Iowan Old Style\", Georgia, serif",
      bodyFontFamily: "\"Aptos\", \"Segoe UI\", sans-serif",
      headlineWeight: 700,
      bodyWeight: 400,
      spacingBase: 8,
      pagePadding: 72,
      gutter: 40,
      radiusLarge: 34,
      radiusSmall: 18,
    },
    typographyGuidance: [
      "Put the verdict in the strongest visible line on the page.",
      "Keep comparison dimensions short and decision-relevant.",
    ],
    surfaceGuidance: [
      "Use asymmetry rather than balanced twin panels.",
      "Reserve stronger chrome for the lead side only.",
    ],
    chartGuidance: [
      "If metrics matter, use one compact comparison object rather than many small charts.",
    ],
    avoidPatterns: [
      "Do not make both sides feel equally weighted when one clearly wins.",
    ],
  },
  {
    id: "theme.consulting-chart-annotation",
    label: "Consulting Chart Annotation",
    summary: "Chart-led consulting theme with a clean white canvas, direct labels, and restrained event highlights.",
    tokens: {
      pageBackground: "#ffffff",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#f2f7fb",
      textPrimary: "#1c2530",
      textMuted: "#67707b",
      accentPrimary: "#d4a611",
      borderSubtle: "#d7e3ed",
      headlineFontFamily: "\"Iowan Old Style\", Georgia, serif",
      bodyFontFamily: "\"Aptos\", \"Segoe UI\", sans-serif",
      headlineWeight: 700,
      bodyWeight: 400,
      spacingBase: 8,
      pagePadding: 68,
      gutter: 32,
      radiusLarge: 24,
      radiusSmall: 16,
    },
    typographyGuidance: [
      "Keep chart titles short and let annotations carry the explanation.",
      "Use muted labels and one stronger conclusion line.",
    ],
    surfaceGuidance: [
      "Keep the chart field mostly clean and avoid decorative side panels.",
      "Use light highlight windows or dashed annotation boxes when events matter.",
    ],
    chartGuidance: [
      "Prefer direct labels and anchored annotations over legends and long side notes.",
    ],
    avoidPatterns: [
      "Do not let a side rail overpower the chart.",
      "Do not surround the chart with multiple card containers.",
    ],
  },
];

function getTheme(id: string) {
  return HTML_REPORT_THEME_REGISTRY.find((theme) => theme.id === id) ?? HTML_REPORT_THEME_REGISTRY[0];
}

export function resolveHtmlReportTheme(args: {
  templateSkill: GenerationTemplateSkillDefinition;
  grammar: HtmlPageGrammarDefinition;
}): HtmlReportThemeDefinition {
  const templateId = args.templateSkill.id;
  const profile = getIndustryStyleProfile(args.templateSkill.theme.profileId);
  let baseTheme: HtmlReportThemeDefinition;

  if (templateId === "template.consulting-chart-annotation") {
    baseTheme = getTheme("theme.consulting-chart-annotation");
  } else if (templateId === "template.consulting-verdict-asymmetry") {
    baseTheme = getTheme("theme.consulting-verdict");
  } else if (templateId === "template.consulting-priority-rail") {
    baseTheme = getTheme("theme.consulting-priority");
  } else if (args.grammar.id === "chart-annotation-stage") {
    baseTheme = getTheme("theme.consulting-chart-annotation");
  } else {
    baseTheme = getTheme("theme.consulting-editorial");
  }

  return applyIndustryProfileToHtmlTheme({
    theme: baseTheme,
    profile,
  });
}

export { HTML_REPORT_THEME_REGISTRY };
