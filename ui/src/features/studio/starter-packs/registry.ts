import type {
  BlockKind,
  LayoutPage,
  ModuleRegistryCategory,
  ModuleRendererCapability,
  ModuleTemplateFamily,
  PublishedModuleManifest,
  PublishedTemplateManifest,
  StarterPageContract,
  StarterPackMappingStatus,
  StarterPackDeck,
  StarterPackId,
  StarterPackKind,
  StarterPackLayout,
  StarterPackManifest,
  StarterPackTheme,
  StarterPackUsageMode,
} from "../types";

export const STARTER_PACK_SOURCE = "html-ppt-skill" as const;
export const STARTER_PACK_MODULE_ID_PREFIX = "starter-pack.";
export const STARTER_PACK_THEME_MODULE_ID_PREFIX = `${STARTER_PACK_MODULE_ID_PREFIX}theme.`;
export const STARTER_PACK_PAGE_MODULE_ID_PREFIX = `${STARTER_PACK_MODULE_ID_PREFIX}page.`;
export const STARTER_PACK_DECK_MODULE_ID_PREFIX = `${STARTER_PACK_MODULE_ID_PREFIX}deck.`;

const DECK_AND_THEME_USAGE: StarterPackUsageMode[] = ["deck", "theme"];
const PAGE_ONLY_USAGE: StarterPackUsageMode[] = ["page"];
const SHELL_ONLY_MAPPING: StarterPackMappingStatus = "shell-only";
const MANUAL_WORKBENCH_MAPPING: StarterPackMappingStatus = "manual-workbench";
const COMPILED_TEMPLATE_MAPPING: StarterPackMappingStatus = "compiled-template";

const STARTER_PAGE_CONTRACTS: Record<string, StarterPageContract> = {
  "starter.cover": {
    preferredVisualOperator: "poster-claim",
    dominantGeometry: "One oversized headline field with one short lede and light metadata chips.",
    allowedSecondaryZones: ["kicker", "lede", "metadata pills"],
    copyDensityBudget: "Low density. One dominant claim, one short support line, optional compact metadata.",
    noGoPatterns: ["card wall", "equal-weight columns", "footer summary bar"],
  },
  "starter.section-divider": {
    preferredVisualOperator: "poster-claim",
    dominantGeometry: "One section number and one large divider title on an open field.",
    allowedSecondaryZones: ["section number", "divider rule"],
    copyDensityBudget: "Very low density. One title only with optional number.",
    noGoPatterns: ["secondary proof cards", "chart region", "dense paragraph stack"],
  },
  "starter.bullets": {
    preferredVisualOperator: "single-proof-canvas",
    dominantGeometry: "One title with one disciplined bullet stack occupying the main reading column.",
    allowedSecondaryZones: ["title", "bullet list"],
    copyDensityBudget: "Moderate density. 3-5 bullets with short lines.",
    noGoPatterns: ["multiple side panels", "large hero art", "dashboard grid"],
  },
  "starter.two-column": {
    preferredVisualOperator: "single-proof-canvas",
    dominantGeometry: "One dominant left pane and one subordinate right pane separated by a clean structural gap.",
    allowedSecondaryZones: ["left pane", "right pane", "shared title"],
    copyDensityBudget: "Moderate density. Keep one stronger pane and one supporting pane.",
    noGoPatterns: ["equal-weight four-card wall", "chart with long footer", "poster opener"],
  },
  "starter.comparison": {
    preferredVisualOperator: "comparison-split",
    dominantGeometry: "Two contrasted panes with an explicit comparison axis and visible split.",
    allowedSecondaryZones: ["left side", "right side", "comparison axis title"],
    copyDensityBudget: "Moderate density. Two contrasted sides only.",
    noGoPatterns: ["summary opener", "third supporting rail", "stacked bullet wall"],
  },
  "starter.timeline": {
    preferredVisualOperator: "case-timeline",
    dominantGeometry: "One horizontal path with short milestone stops and compact annotations.",
    allowedSecondaryZones: ["timeline title", "milestones", "small notes"],
    copyDensityBudget: "Moderate density. 4-5 milestones with short labels.",
    noGoPatterns: ["multi-column cards", "chart-first proof", "hero opener"],
  },
  "starter.arch-diagram": {
    preferredVisualOperator: "annotation-stage",
    dominantGeometry: "One tiered system stack or staged figure with compact labels aligned to the figure.",
    allowedSecondaryZones: ["system stage", "short annotations", "title"],
    copyDensityBudget: "Low-to-moderate density. Figure stays dominant.",
    noGoPatterns: ["generic bullet page", "card wall", "footer-heavy comparison"],
  },
  "starter.chart-bar": {
    preferredVisualOperator: "hero-chart",
    dominantGeometry: "One dominant bar chart with one compact takeaway panel beside it.",
    allowedSecondaryZones: ["bar chart", "takeaway", "title"],
    copyDensityBudget: "Low density outside the chart. Keep interpretation short.",
    noGoPatterns: ["second analysis panel", "long paragraph below chart", "generic opener"],
  },
};

const COMPILED_TEMPLATE_STARTER_IDS = new Set<StarterPackId>([
  "starter.cover",
  "starter.comparison",
  "starter.timeline",
  "starter.arch-diagram",
]);

const STARTER_PACK_THEME_DEFINITIONS: StarterPackTheme[] = [
  {
    id: "corporate-clean",
    source: STARTER_PACK_SOURCE,
    label: "Corporate clean",
    description: "White, conservative, and board-safe with navy accents.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/corporate-clean.css",
  },
  {
    id: "swiss-grid",
    source: STARTER_PACK_SOURCE,
    label: "Swiss grid",
    description: "Editorial grid discipline with a restrained modernist tone.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/swiss-grid.css",
  },
  {
    id: "editorial-serif",
    source: STARTER_PACK_SOURCE,
    label: "Editorial serif",
    description: "Magazine-like serif hierarchy on a warm light surface.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/editorial-serif.css",
  },
  {
    id: "academic-paper",
    source: STARTER_PACK_SOURCE,
    label: "Academic paper",
    description: "Research-leaning paper white with serif body and blue ink accents.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/academic-paper.css",
  },
  {
    id: "blueprint",
    source: STARTER_PACK_SOURCE,
    label: "Blueprint",
    description: "Technical blue-grid visual language for systems and architecture.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/blueprint.css",
  },
  {
    id: "tokyo-night",
    source: STARTER_PACK_SOURCE,
    label: "Tokyo night",
    description: "Cool dark technical theme for product and engineering narratives.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/tokyo-night.css",
  },
  {
    id: "xiaohongshu-white",
    source: STARTER_PACK_SOURCE,
    label: "Xiaohongshu white",
    description: "Warm white social-editorial theme with soft color accents.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/xiaohongshu-white.css",
  },
  {
    id: "cyberpunk-neon",
    source: STARTER_PACK_SOURCE,
    label: "Cyberpunk neon",
    description: "High-contrast neon dark theme for dramatic technical storytelling.",
    vendoredPath: "vendor/html-ppt-skill/assets/themes/cyberpunk-neon.css",
  },
];

const STARTER_PACK_LAYOUT_DEFINITIONS: Array<
  Omit<StarterPackLayout, "usageModes" | "mappingStatus" | "pageContract">
> = [
  {
    id: "starter.cover",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Cover",
    description: "A large-title opener with kicker, lede, and pill metadata.",
    themeId: "corporate-clean",
    pageFamily: "cover",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/cover.html",
    visualRules: [
      "Use one oversized headline and one supporting lede only.",
      "Keep metadata compact in small chips or kicker text.",
      "Let negative space carry the drama; do not add equal-weight cards.",
    ],
    suggestedLayoutFamilies: ["poster-claim", "center-stage-figure"],
    preview: {
      eyebrow: "Starter pack",
      title: "Large opener",
      body: "Kicker, oversized title, and one disciplined lede.",
      tone: "light",
    },
  },
  {
    id: "starter.section-divider",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Section divider",
    description: "A numbered section break with one strong section title.",
    themeId: "swiss-grid",
    pageFamily: "section-divider",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/section-divider.html",
    visualRules: [
      "Show one section number and one section title.",
      "Avoid secondary proof zones or narrative cards.",
      "Use typography and spacing rather than extra furniture.",
    ],
    suggestedLayoutFamilies: ["poster-claim"],
    preview: {
      eyebrow: "Starter pack",
      title: "Section break",
      body: "One number, one title, one transition moment.",
      tone: "light",
    },
  },
  {
    id: "starter.bullets",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Bullets",
    description: "A text-first layout with one title and a clean bullet stack.",
    themeId: "editorial-serif",
    pageFamily: "bullets",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/bullets.html",
    visualRules: [
      "Keep one title and one compact bullet stack.",
      "Do not add decorative filler beyond the text scaffold.",
      "Bullet rhythm should be the primary visual logic.",
    ],
    suggestedLayoutFamilies: ["single-proof-canvas"],
    preview: {
      eyebrow: "Starter pack",
      title: "Bullet narrative",
      body: "One title and a disciplined list hierarchy.",
      tone: "light",
    },
  },
  {
    id: "starter.two-column",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Two-column",
    description: "A balanced dual-pane page for concept-plus-proof or before-and-after.",
    themeId: "corporate-clean",
    pageFamily: "two-column",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/two-column.html",
    visualRules: [
      "Two panes should stay visibly primary and secondary, not equal cluttered stacks.",
      "Use the left pane for the dominant claim unless the brief argues otherwise.",
      "Keep the gap between panes clean and structural.",
    ],
    suggestedLayoutFamilies: ["single-proof-canvas", "asymmetric-proof-field"],
    preview: {
      eyebrow: "Starter pack",
      title: "Dual-pane logic",
      body: "Concept on one side, proof or detail on the other.",
      tone: "light",
    },
  },
  {
    id: "starter.comparison",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Comparison",
    description: "A before-vs-after split built for contrasts and trade-offs.",
    themeId: "swiss-grid",
    pageFamily: "comparison",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/comparison.html",
    visualRules: [
      "Use two clearly contrasted panes with one comparison title.",
      "Keep the comparison axis explicit and visible.",
      "Do not let either side fragment into a card wall.",
    ],
    suggestedLayoutFamilies: ["comparison-split", "single-proof-canvas"],
    preview: {
      eyebrow: "Starter pack",
      title: "Contrast frame",
      body: "Structured before-and-after or option-vs-option view.",
      tone: "light",
    },
  },
  {
    id: "starter.timeline",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Timeline",
    description: "A horizontal timeline with milestones and one supporting frame.",
    themeId: "academic-paper",
    pageFamily: "timeline",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/timeline.html",
    visualRules: [
      "Keep the timeline as one dominant horizontal path.",
      "Milestones should be short and scannable.",
      "Use annotations sparingly around the path rather than separate cards.",
    ],
    suggestedLayoutFamilies: ["case-timeline", "vertical-story-strip"],
    preview: {
      eyebrow: "Starter pack",
      title: "Milestone path",
      body: "One linear narrative with compact moments and dates.",
      tone: "light",
    },
  },
  {
    id: "starter.arch-diagram",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Architecture diagram",
    description: "A tiered architecture stage with layers and compact explanatory notes.",
    themeId: "blueprint",
    pageFamily: "arch-diagram",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/arch-diagram.html",
    visualRules: [
      "Treat the architecture as one staged figure with compact labels.",
      "Keep layer labels short and aligned to the system stack.",
      "Use diagram logic, not generic rail cards.",
    ],
    suggestedLayoutFamilies: ["annotation-stage", "center-stage-figure"],
    preview: {
      eyebrow: "Starter pack",
      title: "System stack",
      body: "Tiered architecture with compact labels and separators.",
      tone: "light",
    },
  },
  {
    id: "starter.chart-bar",
    source: STARTER_PACK_SOURCE,
    kind: "layout",
    label: "Chart bar",
    description: "A chart-first page with one bar chart and a compact takeaway zone.",
    themeId: "tokyo-night",
    pageFamily: "chart-bar",
    vendoredPath: "vendor/html-ppt-skill/templates/single-page/chart-bar.html",
    visualRules: [
      "The bar chart is the dominant visual proof.",
      "Keep interpretation in one compact takeaway zone.",
      "Do not add a second analysis panel beneath the chart.",
    ],
    suggestedLayoutFamilies: ["annotation-stage", "hero-chart"],
    preview: {
      eyebrow: "Starter pack",
      title: "Chart-first proof",
      body: "One dominant bar chart with a compact explanation cluster.",
      tone: "dark",
    },
  },
];

const STARTER_PACK_DECK_DEFINITIONS: Array<
  Omit<StarterPackDeck, "usageModes" | "mappingStatus">
> = [
  {
    id: "starter.pitch-deck",
    source: STARTER_PACK_SOURCE,
    kind: "deck",
    label: "Pitch deck",
    description: "A fundraising-flavored multi-page starter with clean investor pacing.",
    themeId: "corporate-clean",
    pageFamily: "pitch-deck",
    vendoredPath: "vendor/html-ppt-skill/templates/full-decks/pitch-deck/index.html",
    pageCount: 10,
    pageTitles: [
      "Cover",
      "Problem",
      "Solution",
      "Why now",
      "Product",
      "Traction",
      "Market",
      "Business model",
      "Go-to-market",
      "Close",
    ],
    pageArchetypes: [
      "cover",
      "problem",
      "solution",
      "why-now",
      "product",
      "traction",
      "market",
      "business-model",
      "go-to-market",
      "close",
    ],
    visualRules: [
      "Use investor-grade white-space and keep each page mission singular.",
      "Let one chart, comparison, or proof surface dominate each proof page.",
      "Preserve a clean fundraising rhythm rather than mixing unrelated page shapes.",
    ],
    suggestedLayoutFamilies: ["poster-claim", "comparison-split", "annotation-stage"],
    preview: {
      eyebrow: "Starter pack",
      title: "Fundraising rhythm",
      body: "Investor-safe pacing with cover, proof, and close.",
      tone: "light",
    },
  },
  {
    id: "starter.tech-sharing",
    source: STARTER_PACK_SOURCE,
    kind: "deck",
    label: "Tech sharing",
    description: "A developer-facing technical talk starter with code and systems pacing.",
    themeId: "tokyo-night",
    pageFamily: "tech-sharing",
    vendoredPath: "vendor/html-ppt-skill/templates/full-decks/tech-sharing/index.html",
    pageCount: 8,
    pageTitles: [
      "Cover",
      "Agenda",
      "Problem",
      "Architecture",
      "Code path",
      "Results",
      "Trade-offs",
      "Q&A",
    ],
    pageArchetypes: [
      "cover",
      "agenda",
      "problem",
      "architecture",
      "code-path",
      "results",
      "trade-offs",
      "q-and-a",
    ],
    visualRules: [
      "Favor technical clarity and one system idea per page.",
      "Alternate between concept pages, code or architecture proof, and takeaways.",
      "Keep the visual language dark, precise, and engineering-friendly.",
    ],
    suggestedLayoutFamilies: ["annotation-stage", "center-stage-figure", "single-proof-canvas"],
    preview: {
      eyebrow: "Starter pack",
      title: "Engineering talk",
      body: "Architecture, code path, trade-offs, and result pacing.",
      tone: "dark",
    },
  },
  {
    id: "starter.product-launch",
    source: STARTER_PACK_SOURCE,
    kind: "deck",
    label: "Product launch",
    description: "A keynote-style launch starter with dark hero pages and lighter proof pages.",
    themeId: "editorial-serif",
    pageFamily: "product-launch",
    vendoredPath: "vendor/html-ppt-skill/templates/full-decks/product-launch/index.html",
    pageCount: 8,
    pageTitles: [
      "Hero",
      "The shift",
      "Product reveal",
      "Features",
      "How it works",
      "Use cases",
      "Pricing",
      "CTA",
    ],
    pageArchetypes: [
      "hero",
      "market-shift",
      "product-reveal",
      "features",
      "how-it-works",
      "use-cases",
      "pricing",
      "cta",
    ],
    visualRules: [
      "Lead with a clear hero page and a limited set of sculpted feature moments.",
      "Keep product reveals visual-first and avoid dense dashboard pages.",
      "Use launch pacing rather than analytical report pacing.",
    ],
    suggestedLayoutFamilies: ["center-stage-figure", "poster-claim", "single-proof-canvas"],
    preview: {
      eyebrow: "Starter pack",
      title: "Launch keynote",
      body: "Hero-led opener, reveal pages, and a product CTA close.",
      tone: "light",
    },
  },
  {
    id: "starter.weekly-report",
    source: STARTER_PACK_SOURCE,
    kind: "deck",
    label: "Weekly report",
    description: "A recurring business review starter for status, shipped work, and next steps.",
    themeId: "corporate-clean",
    pageFamily: "weekly-report",
    vendoredPath: "vendor/html-ppt-skill/templates/full-decks/weekly-report/index.html",
    pageCount: 7,
    pageTitles: [
      "Cover",
      "KPI snapshot",
      "Highlights",
      "Risks",
      "Shipped",
      "Next week",
      "Requests",
    ],
    pageArchetypes: [
      "cover",
      "kpi-snapshot",
      "highlights",
      "risks",
      "shipped",
      "next-week",
      "asks",
    ],
    visualRules: [
      "Keep review pacing factual, compact, and repetitive in a useful way.",
      "Use one chart or KPI surface when evidence exists; otherwise stay qualitative and directional.",
      "Reserve the closing page for next steps or asks, not a second summary.",
    ],
    suggestedLayoutFamilies: ["evidence-wall", "annotation-stage", "single-proof-canvas"],
    preview: {
      eyebrow: "Starter pack",
      title: "Team review shell",
      body: "KPIs, highlights, risks, and next actions in a recurring rhythm.",
      tone: "light",
    },
  },
];

export const STARTER_PACK_THEMES = STARTER_PACK_THEME_DEFINITIONS;
export const STARTER_PACK_LAYOUTS: StarterPackLayout[] = STARTER_PACK_LAYOUT_DEFINITIONS.map((entry) => ({
  ...entry,
  usageModes: PAGE_ONLY_USAGE.slice(),
  mappingStatus: COMPILED_TEMPLATE_STARTER_IDS.has(entry.id)
    ? COMPILED_TEMPLATE_MAPPING
    : MANUAL_WORKBENCH_MAPPING,
  pageContract: STARTER_PAGE_CONTRACTS[entry.id],
}));
export const STARTER_PACK_DECKS: StarterPackDeck[] = STARTER_PACK_DECK_DEFINITIONS.map((entry) => ({
  ...entry,
  usageModes: DECK_AND_THEME_USAGE.slice(),
  mappingStatus: SHELL_ONLY_MAPPING,
}));
export const STARTER_PACK_LIBRARY: StarterPackManifest[] = [
  ...STARTER_PACK_LAYOUTS,
  ...STARTER_PACK_DECKS,
].map((entry) => ({
  ...entry,
  readOnly: true as const,
}));

export function isStarterPackId(value: unknown): value is StarterPackId {
  return (
    typeof value === "string" &&
    STARTER_PACK_LIBRARY.some((entry) => entry.id === value)
  );
}

export function getStarterPackManifest(starterPackId: StarterPackId | null | undefined) {
  if (!starterPackId) {
    return null;
  }
  return STARTER_PACK_LIBRARY.find((entry) => entry.id === starterPackId) ?? null;
}

export function getStarterPackTheme(themeId: string) {
  return STARTER_PACK_THEMES.find((theme) => theme.id === themeId) ?? null;
}

export function isStarterPackThemeId(value: unknown): value is string {
  return typeof value === "string" && Boolean(getStarterPackTheme(value));
}

export function listStarterPackThemes() {
  return STARTER_PACK_THEMES.slice();
}

export function isStarterPackDeck(
  starter: StarterPackManifest | null | undefined,
): starter is StarterPackManifest & {
  kind: "deck";
  pageCount: number;
  pageTitles: string[];
} {
  return Boolean(starter && starter.kind === "deck");
}

export function isStarterPackLayout(
  starter: StarterPackManifest | null | undefined,
): starter is StarterPackManifest & {
  kind: "layout";
} {
  return Boolean(starter && starter.kind === "layout");
}

export function listStarterPackManifests(kind?: StarterPackKind) {
  return kind
    ? STARTER_PACK_LIBRARY.filter((entry) => entry.kind === kind)
    : STARTER_PACK_LIBRARY.slice();
}

function buildStarterTemplateShape(starter: StarterPackManifest): PublishedTemplateManifest["shape"] {
  if (starter.kind === "deck") {
    return "page-template";
  }
  if (starter.pageFamily === "timeline") {
    return "case-timeline";
  }
  if (starter.pageFamily === "arch-diagram" || starter.pageFamily === "chart-bar") {
    return "annotation-stage";
  }
  if (starter.pageFamily === "cover" || starter.pageFamily === "section-divider") {
    return "poster-claim";
  }
  return "single-proof-canvas";
}

function resolveStarterManifestKind(starter: StarterPackManifest): BlockKind {
  switch (starter.pageFamily) {
    case "chart-bar":
      return "bars";
    case "timeline":
    case "weekly-report":
      return "phases";
    case "arch-diagram":
    case "tech-sharing":
      return "flow";
    case "comparison":
      return "matrix";
    default:
      return "matrix";
  }
}

function resolveStarterManifestCategory(
  starter: StarterPackManifest,
): ModuleRegistryCategory {
  switch (starter.pageFamily) {
    case "chart-bar":
    case "weekly-report":
      return "evidence";
    case "comparison":
      return "comparison";
    case "timeline":
      return "roadmap";
    default:
      return "logic";
  }
}

function resolveStarterManifestFamily(
  starter: StarterPackManifest,
): ModuleTemplateFamily {
  if (starter.pageFamily === "cover" || starter.pageFamily === "section-divider") {
    return "story-pattern";
  }
  if (starter.pageFamily === "chart-bar" || starter.pageFamily === "arch-diagram") {
    return "framework";
  }
  return "primitive";
}

function resolveStarterRendererCapabilities(
  starter: StarterPackManifest,
): ModuleRendererCapability[] {
  if (starter.pageFamily === "chart-bar") {
    return ["bar-comparison"];
  }
  if (starter.pageFamily === "timeline" || starter.pageFamily === "weekly-report") {
    return ["timeline-roadmap"];
  }
  if (starter.pageFamily === "arch-diagram" || starter.pageFamily === "tech-sharing") {
    return ["step-flow"];
  }
  return ["matrix-grid"];
}

export function isStarterPackTransportModuleId(moduleId: string) {
  return moduleId.startsWith(STARTER_PACK_MODULE_ID_PREFIX);
}

function buildStarterPromptHint(parts: Record<string, string | number | null | undefined>) {
  return `starter-pack::${Object.entries(parts)
    .filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined && entry[1] !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(";")}`;
}

function buildStarterPromptContractLines(starter: StarterPackManifest) {
  const theme = getStarterPackTheme(starter.themeId);
  const pageContractLines = starter.pageContract
    ? [
        `Starter operator ${starter.pageContract.preferredVisualOperator}`,
        `Starter dominant geometry ${starter.pageContract.dominantGeometry}`,
        `Starter secondary zones ${starter.pageContract.allowedSecondaryZones.join(" | ")}`,
        `Starter copy density ${starter.pageContract.copyDensityBudget}`,
        ...starter.pageContract.noGoPatterns.slice(0, 3).map((pattern) => `Starter avoid ${pattern}`),
      ]
    : [];
  const archetypeLines =
    starter.kind === "deck" && starter.pageArchetypes?.length
      ? starter.pageArchetypes.slice(0, 12).map((archetype, index) => `Starter archetype ${index + 1}: ${archetype}`)
      : [];

  return [
    `Starter pack theme ${theme?.label ?? starter.themeId}`,
    `Starter family ${starter.pageFamily}`,
    ...starter.suggestedLayoutFamilies.slice(0, 2).map((family) => `Layout family ${family}`),
    ...pageContractLines,
    ...archetypeLines,
  ];
}

export function createStarterPackTransportManifest(
  starter: StarterPackManifest,
  options?: {
    application?: StarterPackUsageMode;
    pageNumber?: number | null;
  },
): PublishedModuleManifest {
  const application = options?.application ?? (starter.kind === "deck" ? "deck" : "page");
  const moduleId =
    application === "page"
      ? `${STARTER_PACK_PAGE_MODULE_ID_PREFIX}${options?.pageNumber ?? "any"}.${starter.id}`
      : `${STARTER_PACK_DECK_MODULE_ID_PREFIX}${starter.id}`;
  const theme = getStarterPackTheme(starter.themeId);
  return {
    moduleId,
    kind: resolveStarterManifestKind(starter),
    category: resolveStarterManifestCategory(starter),
    status: "stable",
    label: starter.label,
    semanticRole: `${starter.label} starter pack from html-ppt-skill. Use it as a visual starting language only when the user explicitly selected it.`,
    promptHint: buildStarterPromptHint({
      source: starter.source,
      application,
      kind: starter.kind,
      "starter-id": starter.id,
      theme: starter.themeId,
      "page-family": starter.pageFamily,
      "page-number": options?.pageNumber ?? null,
      "mapping-status": starter.mappingStatus,
    }),
    rendererCapabilities: resolveStarterRendererCapabilities(starter),
    supportedChartKinds: starter.pageFamily === "chart-bar" ? ["bar"] : [],
    deterministicCapability: "fallback",
    outputContractSummary: starter.visualRules.slice(0, 4),
    fieldManifest: [],
    publishCount: 1,
    lastPublishedAt: null,
    hasPassingEvidence: true,
    trustScore: 1,
    signature: `${moduleId}:${starter.themeId}:${starter.pageFamily}`,
    template: {
      templateId: starter.id,
      sourceModuleId: moduleId,
      label: starter.label,
      family: resolveStarterManifestFamily(starter),
      shape: buildStarterTemplateShape(starter),
      visualHierarchy: [
        `Starter source: ${starter.source}`,
        ...(theme ? [`Theme: ${theme.label}`] : []),
        `Page family: ${starter.pageFamily}`,
      ],
      slotManifest: [],
      decorativeManifest: [],
      copyBudget: starter.kind === "deck" ? ["Deck starter only; preserve page rhythm across the deck."] : ["Page starter only; preserve the starter silhouette and keep copy disciplined."],
      allowedAdaptations: [
        "Use this starter as a visual anchor, not as a script.",
        "Keep the raw brief and current page mission primary.",
      ],
      fitRules: [
        "Do not copy starter placeholder labels verbatim.",
        "Do not invent filler to imitate the starter layout.",
      ],
      promptContract: buildStarterPromptContractLines(starter),
    },
  };
}

export function createStarterThemeTransportManifest(themeId: string): PublishedModuleManifest | null {
  const theme = getStarterPackTheme(themeId);
  if (!theme) {
    return null;
  }

  const moduleId = `${STARTER_PACK_THEME_MODULE_ID_PREFIX}${theme.id}`;
  return {
    moduleId,
    kind: "matrix",
    category: "logic",
    status: "stable",
    label: `${theme.label} theme`,
    semanticRole: `${theme.label} starter theme from html-ppt-skill. Use it only as a visual language and token family.`,
    promptHint: buildStarterPromptHint({
      source: theme.source,
      application: "theme",
      kind: "theme",
      theme: theme.id,
      "page-family": "theme-only",
      "mapping-status": SHELL_ONLY_MAPPING,
    }),
    rendererCapabilities: ["matrix-grid"],
    supportedChartKinds: [],
    deterministicCapability: "fallback",
    outputContractSummary: [
      theme.description,
      "Theme-only mode: keep page missions and deck cadence unchanged.",
      "Use the theme as color, type, and material direction only.",
    ],
    fieldManifest: [],
    publishCount: 1,
    lastPublishedAt: null,
    hasPassingEvidence: true,
    trustScore: 1,
    signature: `${moduleId}:${theme.id}`,
    template: {
      templateId: `starter-theme.${theme.id}`,
      sourceModuleId: moduleId,
      label: `${theme.label} theme`,
      family: "primitive",
      shape: "single-proof-canvas",
      visualHierarchy: [
        `Starter source: ${theme.source}`,
        `Theme: ${theme.label}`,
        "Theme-only starter",
      ],
      slotManifest: [],
      decorativeManifest: [],
      copyBudget: ["Theme-only starter; preserve the current page missions and deck rhythm."],
      allowedAdaptations: [
        "Use this theme as token family and visual mood only.",
        "Do not change page order, cadence, or family because of theme-only mode.",
      ],
      fitRules: [
        "Do not rewrite the deck structure just to express the theme.",
        "Keep raw brief, page mission, and page starter rules primary.",
      ],
      promptContract: [
        `Starter pack theme ${theme.label}`,
        "Starter family theme-only",
        `Starter dominant geometry ${theme.description}`,
      ],
    },
  };
}

export function buildStarterDeckPages(
  starter: StarterPackManifest & {
    kind: "deck";
    pageCount: number;
    pageTitles: string[];
  },
): LayoutPage[] {
  return starter.pageTitles.map((title, index) => ({
    id: String(index + 1),
    chapter: `Page ${index + 1}`,
    title,
    note: starter.pageArchetypes?.[index] ? `Starter archetype: ${starter.pageArchetypes[index]}` : "",
    instruction: starter.pageArchetypes?.[index]
      ? `Page archetype: ${starter.pageArchetypes[index]}. Use ${starter.label} as the deck rhythm, not as placeholder copy.`
      : "",
    starterLayoutId: null,
    blocks: [],
  }));
}

function buildStarterPageInstruction(starter: StarterPackManifest) {
  const contract = starter.pageContract;
  return [
    `Starter page: ${starter.label}.`,
    "Use this starter as a visual scaffold only; the raw brief and page mission stay primary.",
    ...starter.visualRules.slice(0, 2),
    ...(contract
      ? [
          `Preferred operator: ${contract.preferredVisualOperator}.`,
          `Dominant geometry: ${contract.dominantGeometry}.`,
          `Avoid: ${contract.noGoPatterns.slice(0, 2).join(" / ")}.`,
        ]
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function createStarterLayoutPage(args: {
  starter: StarterPackManifest & { kind: "layout" };
  pageId?: string;
  pageNumber?: number;
  title?: string;
}): LayoutPage {
  const pageNumber = Math.max(1, args.pageNumber ?? 1);
  const theme = getStarterPackTheme(args.starter.themeId);
  return {
    id: args.pageId ?? String(pageNumber),
    chapter: `Page ${pageNumber}`,
    title: args.title?.trim() || args.starter.label,
    note: `${args.starter.label} starter · ${theme?.label ?? args.starter.themeId} · ${args.starter.pageFamily}`,
    instruction: buildStarterPageInstruction(args.starter),
    starterLayoutId: args.starter.id,
    blocks: [],
  };
}

export function applyStarterLayoutToPage(
  page: LayoutPage,
  starter: StarterPackManifest & { kind: "layout" },
): LayoutPage {
  const theme = getStarterPackTheme(starter.themeId);
  const starterLabel = `${starter.label} starter · ${theme?.label ?? starter.themeId} · ${starter.pageFamily}`;
  return {
    ...page,
    note: [page.note, starterLabel].filter(Boolean).join(" · "),
    instruction: [page.instruction, buildStarterPageInstruction(starter)].filter(Boolean).join(" "),
    starterLayoutId: starter.id,
    blocks: page.blocks.map((block) => ({ ...block })),
  };
}

function scoreStarterRecommendation(starter: StarterPackManifest, briefText: string) {
  const normalized = briefText.toLowerCase();
  if (!normalized.trim()) {
    return 0;
  }

  let score = 0;
  if (starter.id === "starter.weekly-report" && /\b(?:weekly|status|kpi|risk|risks|next week|shipped|requests?)\b|(?:周报|週報|风险|風險|下周|下週|KPI)/i.test(briefText)) {
    score += 10;
  }
  if (starter.id === "starter.tech-sharing" && /\b(?:architecture|system|engineering|code|trade-?offs?|tech sharing|developer)\b|(?:架构|架構|系统|系統|工程|代码|技術分享)/i.test(briefText)) {
    score += 10;
  }
  if (starter.id === "starter.product-launch" && /\b(?:launch|reveal|feature|keynote|pricing|cta)\b|(?:发布|發佈|发布会|發佈會|产品发布|產品發佈|功能|定价|定價)/i.test(briefText)) {
    score += 10;
  }
  if (starter.id === "starter.cover" && /\b(?:opener|opening|vision|title page|cover)\b|(?:封面|愿景|願景|标题页|標題頁|开场|開場)/i.test(briefText)) {
    score += 10;
  }
  if (starter.kind === "layout" && starter.pageFamily === "arch-diagram" && /\b(?:architecture|system|stack|platform)\b|(?:架构|架構|系统|系統|平台|分层|分層)/i.test(briefText)) {
    score += 7;
  }
  if (starter.kind === "layout" && starter.pageFamily === "comparison" && /\b(?:compare|comparison|versus|vs|trade-?off)\b|(?:对比|比較|比较|取舍|權衡)/i.test(briefText)) {
    score += 7;
  }
  if (starter.kind === "layout" && starter.pageFamily === "timeline" && /\b(?:timeline|roadmap|milestone|history)\b|(?:时间线|時間線|路线图|路線圖|里程碑|里程碑)/i.test(briefText)) {
    score += 7;
  }
  if (starter.kind === "layout" && starter.pageFamily === "chart-bar" && /\b(?:chart|bar|ranking|kpi|metric)\b|(?:图表|圖表|柱状图|柱狀圖|排名|指标|指標)/i.test(briefText)) {
    score += 7;
  }
  return score;
}

export function recommendStarterPackManifests(args: {
  briefText: string;
  kind?: StarterPackKind;
  limit?: number;
}) {
  const limit = Math.max(1, args.limit ?? 4);
  return listStarterPackManifests(args.kind)
    .map((starter) => ({
      starter,
      score: scoreStarterRecommendation(starter, args.briefText),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.starter.label.localeCompare(right.starter.label))
    .slice(0, limit)
    .map((entry) => entry.starter);
}
