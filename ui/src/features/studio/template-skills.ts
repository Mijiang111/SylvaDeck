import type {
  GenerationAnalysisSkillDefinition,
  GenerationDesignPlan,
  GenerationPageArchetypeDefinition,
  GenerationTemplateSkillDefinition,
} from "./generation-contract";
import {
  applyIndustryProfileToTemplateSkill,
  inferIndustryStyleProfile,
} from "./industry-style";

const TEMPLATE_SKILL_REGISTRY: GenerationTemplateSkillDefinition[] = [
  {
    id: "template.consulting-editorial-brief",
    label: "Consulting Editorial Brief",
    summary:
      "A restrained editorial page with a strong thesis, generous whitespace, and one smaller evidence rail.",
    visualIntent:
      "Make the page feel authored, calm, and executive-ready rather than like a dashboard or card board.",
    compositionPatterns: [
      "Use one dominant thesis field and one smaller supporting rail.",
      "Keep the close compact and low on the page.",
      "Favor asymmetry and a single reading path from headline to proof to takeaway.",
    ],
    typographyRules: [
      "Use a strong serif headline with smaller sans support copy.",
      "Keep support copy tight and let hierarchy come from scale rather than chrome.",
    ],
    surfaceRules: [
      "Use soft planes and thin dividers rather than heavy filled panels.",
      "Reserve chrome for one supporting rail or one callout surface.",
    ],
    chartRules: [
      "Only use charts when the page truly needs them.",
      "If no chart is essential, let typography and spacing carry the page.",
    ],
    annotationRules: [
      "Use short evidence labels or compact proof clusters instead of long section headers.",
      "Anchor annotations near the content they explain.",
    ],
    paletteHints: [
      "Warm neutral background.",
      "Deep navy text.",
      "One restrained accent line.",
    ],
    theme: {
      background: "#f7f3eb",
      surface: "#fffaf1",
      surfaceAlt: "#edf3f7",
      accent: "#173d57",
      text: "#17283b",
      muted: "#617382",
      chartPrimary: "#173d57",
      chartSecondary: "#c8a14f",
    },
    avoidPatterns: [
      "Do not create many same-weight cards.",
      "Do not flood the page with tinted surfaces.",
    ],
  },
  {
    id: "template.consulting-priority-rail",
    label: "Consulting Priority Rail",
    summary:
      "A consulting page system for ranked priorities with one clear direction, one ordered stack, and one execution rail.",
    visualIntent:
      "Turn the page into a decision-oriented priority view with obvious ordering and enough restraint to feel professional.",
    compositionPatterns: [
      "Lead with one directional statement and one ordered stack.",
      "Use a smaller right rail for execution conditions, risks, or watch-outs.",
      "Let the top priority feel heavier than the rest.",
    ],
    typographyRules: [
      "Use one large headline and smaller action-oriented priority labels.",
      "Keep numbered or ordered items short and crisp.",
    ],
    surfaceRules: [
      "Use one primary stack surface and one secondary rail surface.",
      "Keep dividers thin and spacing generous.",
    ],
    chartRules: [
      "Prefer ranked lists over charts unless numerical ranking is the point.",
      "Do not use decorative chronology.",
    ],
    annotationRules: [
      "Use one or two short execution annotations rather than extra paragraphs.",
      "Keep labels operational and decision-focused.",
    ],
    paletteHints: [
      "Warm paper canvas.",
      "Navy text and muted blue-grey support.",
      "One amber accent for ordering.",
    ],
    theme: {
      background: "#f7f3eb",
      surface: "#ffffff",
      surfaceAlt: "#eef3f6",
      accent: "#c4973d",
      text: "#162838",
      muted: "#667889",
      chartPrimary: "#173d57",
      chartSecondary: "#c4973d",
    },
    avoidPatterns: [
      "Do not present all priorities as equal cards.",
      "Do not use multiple decorative banners.",
    ],
  },
  {
    id: "template.consulting-verdict-asymmetry",
    label: "Consulting Verdict Asymmetry",
    summary:
      "An asymmetric comparison page that declares the verdict first and uses contrast to support it.",
    visualIntent:
      "Make one side visibly stronger so the page resolves to a conclusion rather than leaving both options equal.",
    compositionPatterns: [
      "Open with the verdict at the top.",
      "Give the preferred side more area and more typographic weight.",
      "Use the smaller side for trade-offs or conditions, not equal airtime.",
    ],
    typographyRules: [
      "Use a strong verdict line, then short contrasted dimensions.",
      "Avoid long prose blocks under each side.",
    ],
    surfaceRules: [
      "Use one highlighted lead panel and one quieter comparison surface.",
      "Let whitespace separate the two sides instead of thick borders.",
    ],
    chartRules: [
      "If metrics matter, use one compact comparison object rather than multiple tiny charts.",
      "Do not add charts unless they clarify the winner.",
    ],
    annotationRules: [
      "Use short labels to explain why the verdict stands.",
      "Keep the close decisive and brief.",
    ],
    paletteHints: [
      "Neutral canvas with one dark lead surface.",
      "Use accent color sparingly to mark the winning direction.",
    ],
    theme: {
      background: "#f5f3ee",
      surface: "#ffffff",
      surfaceAlt: "#eaf1f6",
      accent: "#173d57",
      text: "#18273a",
      muted: "#667889",
      chartPrimary: "#173d57",
      chartSecondary: "#d3a84f",
    },
    avoidPatterns: [
      "Do not build a balanced 50/50 comparison if one option clearly wins.",
      "Do not reopen the decision in the footer.",
    ],
  },
  {
    id: "template.consulting-chart-annotation",
    label: "Consulting Chart Annotation",
    summary:
      "A chart-led consulting page inspired by annotated strategy charts: one large plot, direct labels, and a few highlighted regimes or turning points.",
    visualIntent:
      "Let the chart carry the page, then use compact annotations to explain the pattern without turning the slide into a dashboard.",
    compositionPatterns: [
      "Center a large chart zone as the dominant object.",
      "Use one short title, one concise subtitle, and one or two anchored annotations.",
      "Keep supporting narrative outside the chart compact and secondary.",
    ],
    typographyRules: [
      "Use a centered or balanced headline system above the chart.",
      "Keep annotation labels short and visually tethered to the relevant regime or inflection point.",
    ],
    surfaceRules: [
      "Keep the chart canvas mostly clean and white.",
      "Use light tints or dashed highlight boxes for event windows.",
    ],
    chartRules: [
      "Prefer direct labels, visible data symbols, and clear axis hierarchy.",
      "When two series are shown, make the primary relationship legible before adding commentary.",
      "Avoid redundant legends if the series can be identified directly.",
    ],
    annotationRules: [
      "Highlight only the one or two turning points that matter most.",
      "Use short annotation callouts instead of long side panels.",
    ],
    paletteHints: [
      "White chart canvas.",
      "Blue secondary series, warm gold primary series.",
      "Soft green or red highlight windows when events matter.",
    ],
    theme: {
      background: "#ffffff",
      surface: "#ffffff",
      surfaceAlt: "#f2f7fb",
      accent: "#d4a611",
      text: "#1c2530",
      muted: "#67707b",
      chartPrimary: "#f1c40f",
      chartSecondary: "#3498db",
    },
    avoidPatterns: [
      "Do not put a heavy side rail that competes with the chart.",
      "Do not surround the chart with multiple card containers.",
    ],
  },
];

function getTemplateSkill(id: string) {
  return TEMPLATE_SKILL_REGISTRY.find((skill) => skill.id === id) ?? TEMPLATE_SKILL_REGISTRY[0];
}

export function resolveGenerationTemplateSkill(args: {
  sourceText?: string;
  pageTitle: string;
  pageNote: string;
  plan: GenerationDesignPlan;
  analysisSkill: GenerationAnalysisSkillDefinition | null;
  pageArchetype: GenerationPageArchetypeDefinition;
}): GenerationTemplateSkillDefinition {
  const styleProfile = inferIndustryStyleProfile({
    sourceText: [args.sourceText ?? "", args.pageTitle, args.pageNote, args.plan.pageRole].join("\n"),
    semanticHints: [
      args.analysisSkill?.summary ?? "",
      args.analysisSkill?.questionFrame ?? "",
      args.pageArchetype.label,
    ],
  });

  let baseSkill: GenerationTemplateSkillDefinition;
  if (args.pageArchetype.id === "chart-insight") {
    baseSkill = getTemplateSkill("template.consulting-chart-annotation");
  } else if (args.pageArchetype.id === "priority-rail") {
    baseSkill = getTemplateSkill("template.consulting-priority-rail");
  } else if (args.pageArchetype.id === "verdict-comparison") {
    baseSkill = getTemplateSkill("template.consulting-verdict-asymmetry");
  } else {
    baseSkill = getTemplateSkill("template.consulting-editorial-brief");
  }

  return applyIndustryProfileToTemplateSkill({
    skill: baseSkill,
    profile: styleProfile,
  });
}

export { TEMPLATE_SKILL_REGISTRY };
