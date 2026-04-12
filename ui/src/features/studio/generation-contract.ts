import type { SkillDefinition, SlideSceneObject, SlideSceneObjectKind } from "./types";

export type GenerationSkillClass = SkillDefinition["class"] | "storyline";
export type DeckThinkingMode =
  | "neutral"
  | "strategy"
  | "case-study"
  | "academic-research";

export type GenerationSkillFieldRule = {
  fieldId: string;
  rule: string;
  required: boolean;
  examples: string[];
};

export type GenerationSkillDefinition = {
  id: string;
  label: string;
  class: GenerationSkillClass;
  semanticPromise: string;
  summary: string;
  logicBlocks: string[];
  fieldRules: GenerationSkillFieldRule[];
  antiPatterns: string[];
  evidenceRules: string[];
  styleRules: string[];
};

export type GenerationAnalysisSkillDefinition = {
  id: string;
  label: string;
  summary: string;
  questionFrame: string;
  argumentShape: string[];
  evidenceShape: string[];
  visualStrategy: string[];
  preferredObjects: SlideSceneObjectKind[];
  avoidPatterns: string[];
};

export type GenerationPageCopyBudget = {
  totalVisibleWords: number;
  headlineMaxChars: number;
  thesisMaxChars: number;
  supportingPointCount: number;
  supportingPointMaxChars: number;
  evidenceItemCount: number;
  evidenceItemMaxChars: number;
  closeMaxChars: number;
  recommendedObjectMin: number;
  recommendedObjectMax: number;
};

export type GenerationPageArchetypeDefinition = {
  id: "hero-rail" | "priority-rail" | "verdict-comparison" | "chart-insight";
  label: string;
  summary: string;
  layoutGrammar: string[];
  compositionMoves: string[];
  objectStrategy: string[];
  copyBudget: GenerationPageCopyBudget;
  avoidPatterns: string[];
};

export type GenerationTemplateTheme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  text: string;
  muted: string;
  borderSubtle?: string;
  chartPrimary?: string;
  chartSecondary?: string;
  chartPalette?: string[];
  profileId?: string;
  styleLabel?: string;
};

export type GenerationTemplateSkillDefinition = {
  id: string;
  label: string;
  summary: string;
  visualIntent: string;
  compositionPatterns: string[];
  typographyRules: string[];
  surfaceRules: string[];
  chartRules: string[];
  annotationRules: string[];
  paletteHints: string[];
  theme: GenerationTemplateTheme;
  avoidPatterns: string[];
};

export type GenerationDesignPlan = {
  pageRole: string;
  objective: string;
  keyClaim: string;
  supportingPoints: string[];
  evidenceNotes: string[];
  transitionFromPrevious: string;
  bridgeToNext: string;
};

export type GenerationPageInput = {
  id: string;
  chapter: string;
  title: string;
  note: string;
  plan: GenerationDesignPlan;
  analysisSkill: GenerationAnalysisSkillDefinition | null;
  pageArchetype: GenerationPageArchetypeDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
};

export type PagePlan = GenerationPageInput;

export type DeckPlan = {
  title: string;
  subtitle?: string;
  pages: PagePlan[];
};

export type GenerationRetrievedSkillContext = {
  domainSkills: GenerationSkillDefinition[];
  thinkingMode: DeckThinkingMode;
};

export type DesignResponse = {
  title: string;
  subtitle?: string;
  pageDrafts: Array<{
    pageId: string;
    summary?: string;
    scene: {
      width: 1600;
      height: 900;
      background?: string;
      objects: SlideSceneObject[];
    };
  }>;
};

export type HtmlReportSlotKind = "text" | "list" | "chart" | "annotation";

export type HtmlPageSlotDefinition = {
  id: string;
  label: string;
  kind: HtmlReportSlotKind;
  required: boolean;
  maxItems?: number;
  maxChars?: number;
  description: string;
};

export type HtmlPageGrammarDefinition = {
  id:
    | "hero-left-rail-right"
    | "priority-stack-rail"
    | "verdict-asymmetry"
    | "chart-annotation-stage";
  label: string;
  summary: string;
  layoutIntent: string;
  slotOrder: string[];
  zoneRules: string[];
  copyRules: string[];
  avoidPatterns: string[];
  expectedSlots: HtmlPageSlotDefinition[];
};

export type HtmlReportThemeDefinition = {
  id: string;
  label: string;
  summary: string;
  tokens: {
    pageBackground: string;
    surfacePrimary: string;
    surfaceSecondary: string;
    textPrimary: string;
    textMuted: string;
    accentPrimary: string;
    borderSubtle: string;
    chartPalette?: string[];
    headlineFontFamily: string;
    bodyFontFamily: string;
    headlineWeight: number;
    bodyWeight: number;
    spacingBase: number;
    pagePadding: number;
    gutter: number;
    radiusLarge: number;
    radiusSmall: number;
  };
  typographyGuidance: string[];
  surfaceGuidance: string[];
  chartGuidance: string[];
  avoidPatterns: string[];
};

export type HtmlReportSlotValue = string | string[];

export type HtmlReportPage = {
  pageId: string;
  grammarId: HtmlPageGrammarDefinition["id"];
  title?: string;
  subtitle?: string;
  html: string;
  css?: string;
  slots: Record<string, HtmlReportSlotValue>;
  meta?: {
    themeId?: string;
    templateSkillId?: string;
    analysisSkillId?: string;
  };
};

export type HtmlComposerResponse = {
  title: string;
  subtitle?: string;
  pages: HtmlReportPage[];
};

export type HtmlComposerRequest = {
  deck: DeckPlan;
  page: PagePlan;
  grammar: HtmlPageGrammarDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
  theme: HtmlReportThemeDefinition;
  retrievedSkills: GenerationRetrievedSkillContext;
};

export type HtmlFitIssueCode =
  | "overflow"
  | "repetition"
  | "low-contrast"
  | "unsafe-bounds"
  | "weak-hierarchy"
  | "web-like-chrome";

export type HtmlFitIssue = {
  code: HtmlFitIssueCode;
  severity: "warn" | "fail";
  detail: string;
};

export type HtmlLayoutMeasurement = {
  viewportWidth: 1600;
  viewportHeight: 900;
  contentWidth: number;
  contentHeight: number;
  overflowX: boolean;
  overflowY: boolean;
  repeatedVisibleCopy: boolean;
  lowContrast: boolean;
  outOfBounds: boolean;
  dominantZoneCoverage: number;
  chromeCoverage: number;
};

export type RefinedHtmlReportPage = HtmlReportPage & {
  fitReport: {
    passed: boolean;
    issues: HtmlFitIssue[];
  };
};

export type HtmlRefinerResponse = {
  title: string;
  subtitle?: string;
  pages: RefinedHtmlReportPage[];
};

export type HtmlRefinerRequest = {
  deck: DeckPlan;
  page: PagePlan;
  draft: HtmlReportPage;
  grammar: HtmlPageGrammarDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
  theme: HtmlReportThemeDefinition;
  measurement: HtmlLayoutMeasurement;
  criticIssues: HtmlFitIssue[];
};
