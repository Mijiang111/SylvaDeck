import type { DeckStyleProfile } from "../industry-style.js";
import type {
  GeneratedReportStyleProfile,
  HtmlAnimationPage,
  HtmlOutputMode,
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

export function renderDeterministicPageFromRecipe(args: {
  deckTitle: string;
  recipe: PageRecipe;
  styleProfile: DeckStyleProfile;
  reportStyleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
}) {
  return validateGeneratedPageHtml({
    html: composeSinglePageHtml({
      title: args.deckTitle,
      sectionHtml: composeDeterministicPageSection(args.recipe, args.styleProfile),
      styleProfile: args.reportStyleProfile,
      htmlOutputMode: args.htmlOutputMode,
    }),
    expectedPageNumber: args.recipe.pageNumber,
    expectedPageTitle: args.recipe.pageTitle,
    htmlOutputMode: args.htmlOutputMode,
  });
}

export function recoverDeterministicPageAfterRenderFailures(args: {
  deckTitle: string;
  recipe: PageRecipe;
  styleProfile: DeckStyleProfile;
  reportStyleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
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
  });
}
