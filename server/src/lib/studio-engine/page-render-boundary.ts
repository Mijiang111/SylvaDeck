import type { DeckStyleProfile } from "../industry-style.js";
import type {
  GeneratedReportStyleProfile,
  DeckExportContract,
  ExportObjectContract,
  HtmlAnimationPage,
  HtmlOutputMode,
  PageExportContract,
  PageRecipe,
} from "./contracts.js";
import {
  buildSanitizedFinalReport,
  composeDeckHtml,
  composeDeterministicPageSection,
  composeSinglePageHtml,
  validateGeneratedPageHtml,
} from "./render.js";

export type StudioValidatedPage = ReturnType<typeof validateGeneratedPageHtml>;

export type StudioPageRenderResult = {
  pageNumber: number;
  sectionHtml: string;
  model: string | null;
  animationPage: HtmlAnimationPage | null;
};

export type StudioDeckSectionInput = {
  pageNumber: number;
  sectionHtml: string;
  animationPage?: HtmlAnimationPage | null;
};

export type StudioPageCollection = {
  pageSections: string[];
  pageAnimationPages: HtmlAnimationPage[];
};

export type StudioPageRenderCollection = StudioPageCollection & {
  resolvedModel: string | null;
};

export type StudioFinalReport = ReturnType<typeof buildSanitizedFinalReport>;

function summarizeUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "unknown render failure");
}

const deterministicScaffoldLabelPattern =
  /\b(?:raw brief|ai understanding|visual thinking|active capability cards|user task brief|task rigor brief|renderer brief|proof plan|layout strategy|source material|selected template contract|capability cards|output rules|page argument contract|headline claim|support bullet\s*\d*|support bullets?|evidence callouts?|evidence bullets?|page evidence bundle|brief digest|current page (?:goal|story|intent|objective)|page question|page thesis|page mission|supplied page mission|source basis)\s*:\s*/gi;

const deterministicScaffoldPhrasePattern =
  /\b(?:page rendered only from supplied(?: brief)?|only from supplied brief|no additional metrics are introduced|illustrative trajectory|source basis:\s*page rendered|using the supplied brief|tied to the supplied brief|based on the supplied brief)\b/gi;

function sanitizeDeterministicDisplayText(value: string, fallback: string) {
  const sanitized = value
    .replace(deterministicScaffoldLabelPattern, "")
    .replace(deterministicScaffoldPhrasePattern, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || fallback;
}

function sanitizeDeterministicRecipe(recipe: PageRecipe): PageRecipe {
  return {
    ...recipe,
    pageTitle: sanitizeDeterministicDisplayText(recipe.pageTitle, `Page ${recipe.pageNumber}`),
    pageIntent: sanitizeDeterministicDisplayText(recipe.pageIntent, recipe.pageTitle),
    objective: sanitizeDeterministicDisplayText(recipe.objective, recipe.pageTitle),
    insight: sanitizeDeterministicDisplayText(recipe.insight, recipe.objective),
    heroClaim: sanitizeDeterministicDisplayText(recipe.heroClaim, recipe.pageTitle),
    supportBullets: recipe.supportBullets.map((item) =>
      sanitizeDeterministicDisplayText(item, recipe.pageTitle),
    ),
    evidenceBullets: recipe.evidenceBullets.map((item) =>
      sanitizeDeterministicDisplayText(item, recipe.pageTitle),
    ),
    evidenceBundle: recipe.evidenceBundle.map((item) =>
      sanitizeDeterministicDisplayText(item, recipe.pageTitle),
    ),
    takeaway: sanitizeDeterministicDisplayText(recipe.takeaway, recipe.heroClaim),
    moduleBinding: recipe.moduleBinding
      ? {
          ...recipe.moduleBinding,
          label: sanitizeDeterministicDisplayText(
            recipe.moduleBinding.label,
            "Built-in renderer",
          ),
        }
      : null,
  };
}

export function renderDeterministicPageFromRecipe(args: {
  deckTitle: string;
  recipe: PageRecipe;
  styleProfile: DeckStyleProfile;
  reportStyleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
  exportObjectContract?: ExportObjectContract | null;
  exportObjectContracts?: readonly ExportObjectContract[] | null;
  pageExportContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
}) {
  const sanitizedRecipe = sanitizeDeterministicRecipe(args.recipe);
  return validateGeneratedPageHtml({
    html: composeSinglePageHtml({
      title: args.deckTitle,
      sectionHtml: composeDeterministicPageSection(
        sanitizedRecipe,
        args.styleProfile,
        args.exportObjectContract,
        args.pageExportContract,
      ),
      styleProfile: args.reportStyleProfile,
      htmlOutputMode: args.htmlOutputMode,
    }),
    expectedPageNumber: sanitizedRecipe.pageNumber,
    expectedPageTitle: sanitizedRecipe.pageTitle,
    htmlOutputMode: args.htmlOutputMode,
    expectedExportObjectContract: args.exportObjectContract,
    expectedExportObjectContracts: args.exportObjectContracts,
    expectedPageExportContract: args.pageExportContract,
  });
}

export function recoverDeterministicPageAfterRenderFailures(args: {
  deckTitle: string;
  recipe: PageRecipe;
  styleProfile: DeckStyleProfile;
  reportStyleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
  exportObjectContract?: ExportObjectContract | null;
  exportObjectContracts?: readonly ExportObjectContract[] | null;
  pageExportContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
  model: string;
  primaryError?: unknown;
  fallbackError?: unknown;
}) {
  const page = renderDeterministicPageFromRecipe({
    deckTitle: args.deckTitle,
    recipe: args.recipe,
    styleProfile: args.styleProfile,
    reportStyleProfile: args.reportStyleProfile,
    htmlOutputMode: args.htmlOutputMode,
    exportObjectContract: args.exportObjectContract,
    exportObjectContracts: args.exportObjectContracts,
    pageExportContract: args.pageExportContract,
  });

  return {
    page,
    pageSummary: page.pageHtml,
    model: args.model,
    failureSummary: {
      primary: summarizeUnknownError(args.primaryError),
      fallback: summarizeUnknownError(args.fallbackError),
    },
  };
}

export function collectStudioDeckSections(
  sections: readonly StudioDeckSectionInput[],
): StudioPageCollection {
  const orderedSections = [...sections].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  );

  return {
    pageSections: orderedSections.map((section) => section.sectionHtml),
    pageAnimationPages: orderedSections
      .map((section) => section.animationPage ?? null)
      .filter((page): page is HtmlAnimationPage => Boolean(page)),
  };
}

export function collectStudioPageRenderResults(
  results: readonly StudioPageRenderResult[],
): StudioPageRenderCollection {
  const orderedResults = [...results].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  );

  return {
    pageSections: orderedResults.map((result) => result.sectionHtml),
    pageAnimationPages: orderedResults
      .map((result) => result.animationPage)
      .filter((page): page is HtmlAnimationPage => Boolean(page)),
    resolvedModel:
      orderedResults.find((result) => result.model !== null)?.model ?? null,
  };
}

export function buildFinalStudioReport(args: {
  title: string;
  sections: readonly string[];
  brief: string;
  fallbackTitle?: string;
  styleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
  animationPages?: readonly HtmlAnimationPage[];
  exportContract?: DeckExportContract;
}): StudioFinalReport {
  return buildSanitizedFinalReport({
    html: composeDeckHtml({
      title: args.title,
      sections: [...args.sections],
      styleProfile: args.styleProfile,
      htmlOutputMode: args.htmlOutputMode,
    }),
    brief: args.brief,
    fallbackTitle: args.fallbackTitle ?? args.title,
    styleProfile: args.styleProfile,
    htmlOutputMode: args.htmlOutputMode,
    animationStructure: { pages: [...(args.animationPages ?? [])] },
    exportContract: args.exportContract,
  });
}
