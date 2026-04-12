import { getSkillDefinitionById } from "./config";
import type {
  GenerationRetrievedSkillContext,
  GenerationSkillDefinition,
} from "./generation-contract";
import type { SkillDefinition } from "./types";
import { resolveGenerationThinkingMode } from "./thinking-mode";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampText(text: string, max: number) {
  const normalized = normalizeText(text);
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function serializeSkillDefinition(skill: SkillDefinition): GenerationSkillDefinition {
  return {
    id: skill.id,
    label: clampText(skill.label, 80),
    class: skill.class,
    semanticPromise: clampText(skill.semanticPromise, 220),
    summary: clampText(skill.summary, 220),
    logicBlocks: skill.logicBlocks
      .map((block) =>
        clampText([block.label, block.description].filter(Boolean).join(": "), 220),
      )
      .filter(Boolean)
      .slice(0, 4),
    fieldRules: skill.fieldRules
      .slice(0, 6)
      .map((rule) => ({
        fieldId: clampText(rule.fieldId, 80),
        rule: clampText(rule.rule, 220),
        required: rule.required,
        examples: rule.examples.map((example) => clampText(example, 120)).filter(Boolean).slice(0, 3),
      })),
    antiPatterns: skill.antiPatterns
      .map((pattern) =>
        clampText([pattern.label, pattern.description].filter(Boolean).join(": "), 220),
      )
      .filter(Boolean)
      .slice(0, 4),
    evidenceRules: skill.evidenceRules
      .map((rule) => clampText(rule.description, 220))
      .filter(Boolean)
      .slice(0, 4),
    styleRules: skill.styleRules
      .map((rule) => clampText(rule.description, 220))
      .filter(Boolean)
      .slice(0, 4),
  };
}

function getSkill(skillId: string) {
  const skill = getSkillDefinitionById(skillId);
  return skill ? serializeSkillDefinition(skill) : null;
}

function sourceSkillText(sourceText: string) {
  return normalizeText(sourceText).toLowerCase();
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function inferDomainSkills(text: string) {
  const skills: GenerationSkillDefinition[] = [];

  const maritimeScore = countMatches(text, [
    /\bmaritime\b/,
    /\bshipping\b/,
    /\bvessel\b/,
    /\bport\b/,
    /\bfleet\b/,
    /\bseafarer\b/,
    /\bharbor\b/,
    /\bharbour\b/,
  ]);
  if (maritimeScore >= 2 || /\bmaritime\b/.test(text)) {
    const skill = getSkill("skill.domain.maritime");
    if (skill) {
      skills.push(skill);
    }
  }

  const logisticsScore = countMatches(text, [
    /\blogistics\b/,
    /\bwarehouse\b/,
    /\bfulfillment\b/,
    /\bfulfilment\b/,
    /\bdistribution\b/,
    /\bsupply chain\b/,
    /\blast-mile\b/,
    /\bpick rate\b/,
    /\bfill rate\b/,
  ]);
  if (logisticsScore >= 2 || /\blogistics\b/.test(text)) {
    const skill = getSkill("skill.domain.logistics");
    if (skill) {
      skills.push(skill);
    }
  }

  const saasScore = countMatches(text, [
    /\bsaas\b/,
    /\bsoftware\b/,
    /\bsubscription\b/,
    /\barr\b/,
    /\bmrr\b/,
    /\bnrr\b/,
    /\bchurn\b/,
    /\bcac\b/,
    /\bltv\b/,
    /\bplg\b/,
    /\bactivation\b/,
  ]);
  if (saasScore >= 2 || /\bsaas\b/.test(text)) {
    const skill = getSkill("skill.domain.saas");
    if (skill) {
      skills.push(skill);
    }
  }

  return skills;
}

export function buildGenerationSkillContext(sourceText: string) {
  const sourceTextOnly = sourceSkillText(sourceText);
  const domainSkills = inferDomainSkills(sourceTextOnly);
  const thinkingMode = resolveGenerationThinkingMode(sourceTextOnly);

  return {
    domainSkills,
    thinkingMode,
  } satisfies GenerationRetrievedSkillContext;
}
