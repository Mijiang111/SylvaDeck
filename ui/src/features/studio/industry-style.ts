import type {
  GenerationTemplateSkillDefinition,
  HtmlReportThemeDefinition,
} from "./generation-contract";

export type IndustryStyleProfileId =
  | "general-consulting"
  | "technology"
  | "finance"
  | "healthcare"
  | "industrial"
  | "consumer"
  | "public";

export type DeckStyleProfile = {
  id: IndustryStyleProfileId;
  label: string;
  industryLabel: string;
  summary: string;
  materialDirection: string;
  toneNotes: string[];
  promptGuidance: string[];
  avoidPatterns: string[];
  tokens: {
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
};

const INDUSTRY_SIGNAL_REGISTRY: Array<{
  id: Exclude<IndustryStyleProfileId, "general-consulting">;
  keywords: string[];
}> = [
  {
    id: "technology",
    keywords: [
      "ai",
      "agent",
      "llm",
      "model",
      "software",
      "saas",
      "cloud",
      "platform",
      "engineering",
      "product",
      "deployment",
      "cybersecurity",
      "semiconductor",
      "data center",
      "digital",
    ],
  },
  {
    id: "finance",
    keywords: [
      "finance",
      "financial",
      "bank",
      "banking",
      "capital",
      "treasury",
      "portfolio",
      "valuation",
      "earnings",
      "investor",
      "lending",
      "insurance",
      "asset management",
      "margin",
      "cash flow",
    ],
  },
  {
    id: "healthcare",
    keywords: [
      "healthcare",
      "patient",
      "clinical",
      "biotech",
      "pharma",
      "hospital",
      "therapy",
      "diagnosis",
      "treatment",
      "medtech",
      "trial",
      "care pathway",
      "provider",
    ],
  },
  {
    id: "industrial",
    keywords: [
      "industrial",
      "manufacturing",
      "factory",
      "plant",
      "operations",
      "supply chain",
      "logistics",
      "warehouse",
      "procurement",
      "maintenance",
      "asset uptime",
      "quality yield",
      "production",
    ],
  },
  {
    id: "consumer",
    keywords: [
      "consumer",
      "retail",
      "store",
      "shopper",
      "brand",
      "marketing",
      "category",
      "e-commerce",
      "merchandising",
      "loyalty",
      "basket",
      "conversion",
    ],
  },
  {
    id: "public",
    keywords: [
      "public sector",
      "government",
      "ministry",
      "education",
      "school",
      "university",
      "climate",
      "carbon",
      "emissions",
      "policy",
      "nonprofit",
      "energy transition",
      "public service",
    ],
  },
];

const INDUSTRY_STYLE_PROFILES: Record<IndustryStyleProfileId, DeckStyleProfile> = {
  "general-consulting": {
    id: "general-consulting",
    label: "General Consulting",
    industryLabel: "General consulting",
    summary: "Warm-neutral executive style for ambiguous or mixed-sector briefs.",
    materialDirection: "Warm paper canvas with quiet institutional surfaces.",
    toneNotes: [
      "Executive and professional.",
      "Restrained contrast with quiet supporting chrome.",
      "One confident accent, never a loud brand treatment.",
    ],
    promptGuidance: [
      "Keep the deck light, restrained, and executive-ready.",
      "Use a warm-neutral paper background with crisp institutional typography.",
      "Let the accent appear in only a few places, mostly in chart emphasis and annotation.",
    ],
    avoidPatterns: [
      "Do not use dark slabs or heavy dashboard chrome.",
      "Do not saturate the page with many competing accent colors.",
    ],
    tokens: {
      pageBackground: "#f7f3eb",
      bodyBackground: "#efe7dc",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#eef3f6",
      textPrimary: "#17283b",
      textMuted: "#617382",
      accentPrimary: "#173d57",
      accentSecondary: "#c4973d",
      borderSubtle: "#d8e3ea",
      chartPalette: ["#173d57", "#c4973d", "#6a879a", "#8fa39a"],
    },
  },
  technology: {
    id: "technology",
    label: "Technology Executive",
    industryLabel: "Technology / AI / software",
    summary: "Cool, precise, product-and-platform oriented light executive style.",
    materialDirection: "Cool cloud background with crisp product surfaces and structured data emphasis.",
    toneNotes: [
      "Analytical and modern, but still executive.",
      "Cooler temperature than general consulting.",
      "Charts should feel product-grade, not dashboard-heavy.",
    ],
    promptGuidance: [
      "Make the deck feel technology-native but still presentation-ready.",
      "Use cool light backgrounds, slate-blue typography, and disciplined teal or cobalt accents.",
      "Prefer precise, grid-clean composition over decorative warmth.",
    ],
    avoidPatterns: [
      "Do not make the page look like a consumer app landing page.",
      "Do not use neon accents or glossy hero treatments.",
    ],
    tokens: {
      pageBackground: "#f4f7fb",
      bodyBackground: "#eaf0f7",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#edf4fb",
      textPrimary: "#172b40",
      textMuted: "#607488",
      accentPrimary: "#2a6f97",
      accentSecondary: "#4e89c7",
      borderSubtle: "#d9e5ef",
      chartPalette: ["#2a6f97", "#4e89c7", "#6aa3b1", "#8fa5bd"],
    },
  },
  finance: {
    id: "finance",
    label: "Finance Institutional",
    industryLabel: "Finance / investor / banking",
    summary: "Institutional investor-grade palette with disciplined navy and muted gold support.",
    materialDirection: "Ivory paper with structured slate surfaces and limited investor accents.",
    toneNotes: [
      "Institutional, disciplined, and low-drama.",
      "Slightly cooler than paper consulting, but still calm.",
      "Use gold only as an ordering or emphasis note, never as decoration.",
    ],
    promptGuidance: [
      "Make the deck feel institutional and board-disciplined.",
      "Use ivory or soft parchment backgrounds, deep slate typography, and sparse gold or teal emphasis.",
      "Keep charts sharp, clean, and investor-ready.",
    ],
    avoidPatterns: [
      "Do not make the deck feel like a luxury brand brochure.",
      "Do not use colorful category palettes unless the data truly needs them.",
    ],
    tokens: {
      pageBackground: "#f7f5ef",
      bodyBackground: "#ede9e0",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#f1f4f6",
      textPrimary: "#162536",
      textMuted: "#607080",
      accentPrimary: "#1d4f6e",
      accentSecondary: "#b08b44",
      borderSubtle: "#dce4ea",
      chartPalette: ["#1d4f6e", "#6b7f8e", "#b08b44", "#7f9b88"],
    },
  },
  healthcare: {
    id: "healthcare",
    label: "Healthcare Clinical",
    industryLabel: "Healthcare / biotech / pharma",
    summary: "Clinical clarity with clean white surfaces and calm teal accents.",
    materialDirection: "Clinical white canvas with soft teal structure and evidence-first surfaces.",
    toneNotes: [
      "Clinical, trustworthy, and calm.",
      "Clean white space should carry the deck before chrome does.",
      "Charts should feel rigorous and legible rather than dramatic.",
    ],
    promptGuidance: [
      "Make the deck feel clinical and evidence-led.",
      "Use white or pale mineral backgrounds, soft teal accents, and low-noise surfaces.",
      "Keep the tone calm, precise, and highly credible.",
    ],
    avoidPatterns: [
      "Do not use saturated wellness colors.",
      "Do not make the page feel like a patient marketing brochure.",
    ],
    tokens: {
      pageBackground: "#f6fbfa",
      bodyBackground: "#eaf4f2",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#edf7f5",
      textPrimary: "#17333b",
      textMuted: "#657b83",
      accentPrimary: "#2c7a78",
      accentSecondary: "#5aa7a0",
      borderSubtle: "#d6e7e3",
      chartPalette: ["#2c7a78", "#5aa7a0", "#88b9b4", "#7a8da3"],
    },
  },
  industrial: {
    id: "industrial",
    label: "Industrial Operations",
    industryLabel: "Industrial / manufacturing / operations",
    summary: "Engineered light palette with operational steel-blue accents and compact evidence surfaces.",
    materialDirection: "Stone-neutral canvas with engineered, field-tested structural color.",
    toneNotes: [
      "Operationally rigorous and pragmatic.",
      "Use cooler steel tones with one earthy secondary accent.",
      "Evidence pages should feel engineered rather than editorial.",
    ],
    promptGuidance: [
      "Make the deck feel operational, engineered, and precise.",
      "Use light stone backgrounds, steel-blue structure, and one restrained earthy support tone.",
      "Prefer compact evidence surfaces over decorative storytelling flourishes.",
    ],
    avoidPatterns: [
      "Do not use playful consumer-brand accents.",
      "Do not overdecorate process pages.",
    ],
    tokens: {
      pageBackground: "#f3f1ec",
      bodyBackground: "#e8e4dc",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#eceff2",
      textPrimary: "#21313f",
      textMuted: "#667581",
      accentPrimary: "#4a667d",
      accentSecondary: "#b07a3f",
      borderSubtle: "#d6dde3",
      chartPalette: ["#4a667d", "#b07a3f", "#7a8d5c", "#6f7d87"],
    },
  },
  consumer: {
    id: "consumer",
    label: "Consumer Strategy",
    industryLabel: "Consumer / retail / brand",
    summary: "Warm light market-facing palette that stays restrained and consulting-grade.",
    materialDirection: "Lighter cream canvas with polished market-story surfaces and disciplined accent use.",
    toneNotes: [
      "Category-aware and market-facing, but still analytical.",
      "A little warmer than other profiles, never loud.",
      "Use accent sparingly so the deck still feels professional.",
    ],
    promptGuidance: [
      "Make the deck feel consumer-aware and market-literate without becoming brand-led.",
      "Use warm light surfaces, restrained terracotta or gold accents, and disciplined hierarchy.",
      "Keep the page executive and evidence-led rather than campaign-like.",
    ],
    avoidPatterns: [
      "Do not turn the deck into a marketing lookbook.",
      "Do not use bright brand gradients or social-media color blocking.",
    ],
    tokens: {
      pageBackground: "#faf6f0",
      bodyBackground: "#efe7dd",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#f6ece4",
      textPrimary: "#2a2631",
      textMuted: "#6f6875",
      accentPrimary: "#9b5c49",
      accentSecondary: "#d29a52",
      borderSubtle: "#e5dbd2",
      chartPalette: ["#9b5c49", "#d29a52", "#7f80b3", "#7ea28d"],
    },
  },
  public: {
    id: "public",
    label: "Public Mission",
    industryLabel: "Public / education / climate",
    summary: "Mission-led light palette with trust-building sage and slate tones.",
    materialDirection: "Soft neutral civic canvas with trust-first greens and slate structure.",
    toneNotes: [
      "Mission-led, clear, and trustworthy.",
      "More civic than corporate, but still highly structured.",
      "Charts should emphasize legibility and public accountability.",
    ],
    promptGuidance: [
      "Make the deck feel mission-led, trustworthy, and public-facing without becoming soft or informal.",
      "Use neutral light backgrounds, sage or slate accents, and disciplined information hierarchy.",
      "Keep charts accessible and explanatory.",
    ],
    avoidPatterns: [
      "Do not use activist-poster colors.",
      "Do not over-brand the page with symbolic green treatments.",
    ],
    tokens: {
      pageBackground: "#f4f7f4",
      bodyBackground: "#e7ece8",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#edf3ef",
      textPrimary: "#20333d",
      textMuted: "#667883",
      accentPrimary: "#3f6d58",
      accentSecondary: "#6e8f7d",
      borderSubtle: "#d7e1da",
      chartPalette: ["#3f6d58", "#6e8f7d", "#5c7d97", "#9aa760"],
    },
  },
};

function normalizeText(value: string) {
  return value.toLowerCase();
}

function countKeywordMatches(haystack: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

export function getIndustryStyleProfile(profileId?: string | null): DeckStyleProfile {
  if (profileId && profileId in INDUSTRY_STYLE_PROFILES) {
    return INDUSTRY_STYLE_PROFILES[profileId as IndustryStyleProfileId];
  }

  return INDUSTRY_STYLE_PROFILES["general-consulting"];
}

export function inferIndustryStyleProfile(args: {
  sourceText: string;
  semanticHints?: string[];
}) {
  const haystack = normalizeText([args.sourceText, ...(args.semanticHints ?? [])].join("\n"));
  let bestId: IndustryStyleProfileId = "general-consulting";
  let bestScore = 0;

  for (const candidate of INDUSTRY_SIGNAL_REGISTRY) {
    const score = countKeywordMatches(haystack, candidate.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return getIndustryStyleProfile(bestScore > 0 ? bestId : "general-consulting");
}

export function buildIndustryPaletteHints(profile: DeckStyleProfile) {
  return [
    `${profile.industryLabel} light-theme executive deck.`,
    `${profile.materialDirection}`,
    "Design an original palette that suits the subject matter, then keep backgrounds, surfaces, type, accents, and charts coherent across the page.",
  ];
}

export function applyIndustryProfileToTemplateSkill(args: {
  skill: GenerationTemplateSkillDefinition;
  profile: DeckStyleProfile;
}): GenerationTemplateSkillDefinition {
  const prefersOrderingAccent = args.skill.id === "template.consulting-priority-rail";
  const accent = prefersOrderingAccent
    ? args.profile.tokens.accentSecondary
    : args.profile.tokens.accentPrimary;
  const chartPrimary = args.profile.tokens.chartPalette[0] ?? accent;
  const chartSecondary = args.profile.tokens.chartPalette[1] ?? args.profile.tokens.accentSecondary;

  return {
    ...args.skill,
    paletteHints: buildIndustryPaletteHints(args.profile),
    surfaceRules: [
      ...args.skill.surfaceRules,
      `Respect this material direction: ${args.profile.materialDirection}`,
    ],
    theme: {
      ...args.skill.theme,
      profileId: args.profile.id,
      styleLabel: args.profile.label,
      background: args.profile.tokens.pageBackground,
      surface: args.profile.tokens.surfacePrimary,
      surfaceAlt: args.profile.tokens.surfaceSecondary,
      accent,
      text: args.profile.tokens.textPrimary,
      muted: args.profile.tokens.textMuted,
      borderSubtle: args.profile.tokens.borderSubtle,
      chartPrimary,
      chartSecondary,
      chartPalette: args.profile.tokens.chartPalette,
    },
    avoidPatterns: Array.from(new Set([...args.skill.avoidPatterns, ...args.profile.avoidPatterns])),
  };
}

export function applyIndustryProfileToHtmlTheme(args: {
  theme: HtmlReportThemeDefinition;
  profile: DeckStyleProfile;
}) {
  return {
    ...args.theme,
    id: `${args.theme.id}.${args.profile.id}`,
    label: `${args.profile.label} ${args.theme.label}`,
    summary: `${args.profile.summary} ${args.theme.summary}`,
    tokens: {
      ...args.theme.tokens,
      pageBackground: args.profile.tokens.pageBackground,
      surfacePrimary: args.profile.tokens.surfacePrimary,
      surfaceSecondary: args.profile.tokens.surfaceSecondary,
      textPrimary: args.profile.tokens.textPrimary,
      textMuted: args.profile.tokens.textMuted,
      accentPrimary:
        args.theme.id.includes("priority")
          ? args.profile.tokens.accentSecondary
          : args.profile.tokens.accentPrimary,
      borderSubtle: args.profile.tokens.borderSubtle,
      chartPalette: args.profile.tokens.chartPalette,
    },
    typographyGuidance: [
      ...args.theme.typographyGuidance,
      ...args.profile.toneNotes.map((note) => `Keep the tone ${note.toLowerCase()}`),
    ],
    surfaceGuidance: [
      ...args.theme.surfaceGuidance,
      `Material direction: ${args.profile.materialDirection}`,
    ],
    chartGuidance: [
      ...args.theme.chartGuidance,
      `Prefer chart colors from this family: ${args.profile.tokens.chartPalette.join(", ")}.`,
    ],
    avoidPatterns: Array.from(new Set([...args.theme.avoidPatterns, ...args.profile.avoidPatterns])),
  } satisfies HtmlReportThemeDefinition;
}

export function toGeneratedHtmlReportStyleProfile(profile: DeckStyleProfile) {
  return {
    id: profile.id,
    label: profile.label,
    industryLabel: profile.industryLabel,
    summary: profile.summary,
    materialDirection: profile.materialDirection,
    toneNotes: profile.toneNotes,
    pageBackground: profile.tokens.pageBackground,
    surfaceFill: profile.tokens.surfacePrimary,
    surfaceSecondary: profile.tokens.surfaceSecondary,
    dividerColor: profile.tokens.borderSubtle,
    accentColor: profile.tokens.accentPrimary,
    textPrimary: profile.tokens.textPrimary,
    textMuted: profile.tokens.textMuted,
    chartPalette: profile.tokens.chartPalette,
  };
}
