import assert from "node:assert/strict";
import test from "node:test";
import type { HtmlReportThemeDefinition } from "./generation-contract";
import {
  applyIndustryProfileToHtmlTheme,
  getIndustryStyleProfile,
} from "./industry-style";

function buildBaseTheme(): HtmlReportThemeDefinition {
  return {
    id: "theme.test",
    label: "Test Theme",
    summary: "Test theme.",
    tokens: {
      pageBackground: "#ffffff",
      surfacePrimary: "#ffffff",
      surfaceSecondary: "#f5f5f5",
      textPrimary: "#111111",
      textMuted: "#666666",
      accentPrimary: "#123456",
      borderSubtle: "#dddddd",
      headlineFontFamily: "Georgia, serif",
      bodyFontFamily: "Inter, sans-serif",
      headlineWeight: 700,
      bodyWeight: 400,
      spacingBase: 8,
      pagePadding: 72,
      gutter: 40,
      radiusLarge: 32,
      radiusSmall: 16,
    },
    typographyGuidance: [],
    surfaceGuidance: [],
    chartGuidance: [],
    avoidPatterns: [],
  };
}

test("consulting and finance html themes force square rectangular surfaces", () => {
  for (const profileId of ["general-consulting", "finance"] as const) {
    const theme = applyIndustryProfileToHtmlTheme({
      theme: buildBaseTheme(),
      profile: getIndustryStyleProfile(profileId),
    });

    assert.equal(theme.tokens.radiusLarge, 0);
    assert.equal(theme.tokens.radiusSmall, 0);
    assert.ok(theme.avoidPatterns.some((pattern) => /large rounded rectangles/i.test(pattern)));
  }
});

test("non-institutional html themes keep their base radius tokens", () => {
  const theme = applyIndustryProfileToHtmlTheme({
    theme: buildBaseTheme(),
    profile: getIndustryStyleProfile("technology"),
  });

  assert.equal(theme.tokens.radiusLarge, 32);
  assert.equal(theme.tokens.radiusSmall, 16);
});
