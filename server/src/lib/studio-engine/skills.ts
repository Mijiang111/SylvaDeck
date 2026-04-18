import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../middleware/logger.js";
import type {
  DeckThinkingMode,
  LoadedStudioAnalysisSkill,
  LoadedStudioLayoutRepairSkill,
  LoadedStudio3dHeroSkill,
  LoadedStudioThinkingModeSkill,
  Studio3dHeroReferenceName,
} from "./contracts.js";

function sha1(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

const STUDIO_ANALYSIS_SKILL_FALLBACK = [
  "Use evidence-led professional communication.",
  "Only render charts when the evidence clearly supports categories, series, or a time axis.",
  "When data is sparse, prefer comparison, metrics, or narrative panels over speculative charts.",
  "Use published modules as optional capabilities, not rigid templates.",
  "Never invent unsupported categories, series, or numeric values.",
].join("\n");
const STUDIO_LAYOUT_REPAIR_SKILL_FALLBACK = [
  "Preserve the page role, argument, and evidence while repairing layout fit.",
  "Prioritize reducing density over inventing new content.",
  "Shorten copy, collapse weak secondary modules, and simplify side rails before changing the page thesis.",
  "If a chart is too dense or unsupported, degrade to metrics, comparison, or annotation rather than fabricating new data.",
  "Never invent new numbers, categories, or series.",
  "Fix prompt-leak or truncated titles when they appear.",
].join("\n");
const STUDIO_THINKING_MODE_SKILL_FALLBACKS = {
  strategy: [
    "Use strategy mode only when the brief explicitly asks for recommendations, priorities, decisions, board, investor, or leadership framing.",
    "Use thesis / proof / implication / decision grammar, but keep one page to one argument.",
    "Recommendation-first is allowed only when the brief clearly supports it.",
  ].join("\n"),
  "case-study": [
    "Use case-study mode for customer, company, rollout, transformation, or before/after narratives.",
    "Use context / challenge / intervention / outcome / lesson grammar.",
    "Do not rewrite the case as a generic strategy recommendation deck.",
  ].join("\n"),
  "academic-research": [
    "Use academic-research mode for papers, studies, methods, experiments, and results decks.",
    "Use question / background / method / result / interpretation / limitation-or-next-work grammar.",
    "Do not default to board language, recommendation-first framing, or leadership action language.",
  ].join("\n"),
  "brain-to-deck": [
    "Use brain-to-deck mode when the input is raw, unstructured, or mixed-material and the goal is a polished visual deliverable.",
    "Extract core themes, rebuild narrative flow, and enforce the requested visual style rigidly.",
    "Use action titles, strip decoration, and keep the voice close to the source material.",
  ].join("\n"),
} satisfies Record<Exclude<DeckThinkingMode, "neutral">, string>;
const STUDIO_3D_HERO_SKILL_FALLBACK = [
  "Use a 3D hero page only when the page must explain one system, chip, platform, device, or layered object.",
  "Keep narrative short on the left and one dominant pseudo-3D model on the right.",
  "Use HTML/CSS depth cues such as perspective, layered planes, thickness, highlights, shadows, etched detail, and restrained labels.",
  "Do not turn the page into a dashboard, icon grid, or long narrative block under the model.",
  "If fit becomes tight, compress labels and narrative before simplifying the model.",
].join("\n");
const STUDIO_3D_HERO_REFERENCE_FALLBACKS = {
  "object-grammar-chip-platform": [
    "Object families:",
    "- chip-die-substrate: show substrate, die, seams, etched grid, memory slab, and package edges.",
    "- platform-stack: show layered stack blocks with clear top-to-bottom hierarchy.",
    "- interconnect-fabric: show lanes, mesh, fabric, or bridge structure as the main object.",
    "- system-cutaway: show one engineered shell or chassis with a visible internal hierarchy.",
  ].join("\n"),
  "composition-families": [
    "Composition families:",
    "- right-dominant-cutaway: one large cutaway object on the right, short narrative on the left.",
    "- exploded-stack: vertically or diagonally separated layers that still read as one object.",
    "- layered-chip-slab: one slab-like chip composition with visible thickness and seams.",
    "- platform-block-diagram-3d: a structural platform object, not a flat flowchart or dashboard.",
  ].join("\n"),
  "material-and-annotation-language": [
    "Material and annotation language:",
    "- Use satin silicon, machined surfaces, etched lines, and restrained highlights.",
    "- Labels should be terse, anchored, and technical.",
    "- Keep the object inspectable and physically plausible.",
  ].join("\n"),
  "prompt-examples": [
    "Example hero directions:",
    "- chip-die-substrate + layered-chip-slab: a floating chip slab with etched grid and tight callouts.",
    "- platform-stack + exploded-stack: one stack of layers with clear separation and sparse labels.",
    "- interconnect-fabric + right-dominant-cutaway: a fabric object with visible lanes and bridges.",
  ].join("\n"),
} satisfies Record<
  "object-grammar-chip-platform" | "composition-families" | "material-and-annotation-language" | "prompt-examples",
  string
>;
let cachedStudioAnalysisSkill: LoadedStudioAnalysisSkill | null = null;
let studioAnalysisSkillLogged = false;
let cachedStudioLayoutRepairSkill: LoadedStudioLayoutRepairSkill | null = null;
let studioLayoutRepairSkillLogged = false;
let cachedStudio3dHeroSkill: LoadedStudio3dHeroSkill | null = null;
let studio3dHeroSkillLogged = false;
const cachedStudioThinkingModeSkills = new Map<DeckThinkingMode, LoadedStudioThinkingModeSkill>();
const studioThinkingModeSkillLogged = new Set<DeckThinkingMode>();
const routeModuleDir = path.dirname(fileURLToPath(import.meta.url));
const serverRootDir = path.resolve(routeModuleDir, "..", "..", "..");

function getStudioAnalysisSkillPath() {
  return path.resolve(serverRootDir, "skills", "studio-data-analysis", "SKILL.md");
}

function getStudioLayoutRepairSkillPath() {
  return path.resolve(serverRootDir, "skills", "studio-layout-repair", "SKILL.md");
}

function getStudio3dHeroSkillPath() {
  return path.resolve(serverRootDir, "skills", "studio-3d-hero", "SKILL.md");
}

function getStudio3dHeroReferencePath(name: Studio3dHeroReferenceName) {
  return path.resolve(serverRootDir, "skills", "studio-3d-hero", "references", `${name}.md`);
}

function getStudioThinkingModeSkillPath(mode: Exclude<DeckThinkingMode, "neutral">) {
  return path.resolve(serverRootDir, "skills", `studio-thinking-${mode}`, "SKILL.md");
}

function stripSkillFrontmatter(text: string) {
  if (!text.startsWith("---")) {
    return text.trim();
  }

  const closingIndex = text.indexOf("\n---", 3);
  if (closingIndex < 0) {
    return text.trim();
  }

  return text.slice(closingIndex + 4).trim();
}

export function extractMarkdownSection(markdown: string, heading: string) {
  const normalizedHeading = heading.trim().toLowerCase();
  const lines = markdown.split("\n");
  const startIndex = lines.findIndex((line) => {
    const match = line.match(/^##\s+(.+)$/);
    return match ? match[1]!.trim().toLowerCase() === normalizedHeading : false;
  });
  if (startIndex < 0) {
    return "";
  }

  const collected: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (index > startIndex && /^##\s+/.test(line)) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

export function loadStudioAnalysisSkill(): LoadedStudioAnalysisSkill {
  if (cachedStudioAnalysisSkill) {
    return cachedStudioAnalysisSkill;
  }

  const skillPath = getStudioAnalysisSkillPath();
  try {
    const raw = fs.readFileSync(skillPath, "utf8");
    const body = stripSkillFrontmatter(raw) || STUDIO_ANALYSIS_SKILL_FALLBACK;
    cachedStudioAnalysisSkill = {
      path: skillPath,
      body,
      hash: sha1(body),
      source: "file",
    };
    if (!studioAnalysisSkillLogged) {
      logger.info(
        {
          skillPath,
          skillHash: cachedStudioAnalysisSkill.hash,
        },
        "studio analysis skill loaded",
      );
      studioAnalysisSkillLogged = true;
    }
    return cachedStudioAnalysisSkill;
  } catch (error) {
    cachedStudioAnalysisSkill = {
      path: null,
      body: STUDIO_ANALYSIS_SKILL_FALLBACK,
      hash: sha1(STUDIO_ANALYSIS_SKILL_FALLBACK),
      source: "fallback",
    };
    if (!studioAnalysisSkillLogged) {
      logger.warn(
        {
          skillPath,
          reason: error instanceof Error ? error.message : String(error),
        },
        "studio analysis skill unavailable, using fallback instructions",
      );
      studioAnalysisSkillLogged = true;
    }
    return cachedStudioAnalysisSkill;
  }
}

export function loadStudioLayoutRepairSkill(): LoadedStudioLayoutRepairSkill {
  if (cachedStudioLayoutRepairSkill) {
    return cachedStudioLayoutRepairSkill;
  }

  const skillPath = getStudioLayoutRepairSkillPath();
  try {
    const raw = fs.readFileSync(skillPath, "utf8");
    const body = stripSkillFrontmatter(raw) || STUDIO_LAYOUT_REPAIR_SKILL_FALLBACK;
    cachedStudioLayoutRepairSkill = {
      path: skillPath,
      body,
      hash: sha1(body),
      source: "file",
    };
    if (!studioLayoutRepairSkillLogged) {
      logger.info(
        {
          skillPath,
          skillHash: cachedStudioLayoutRepairSkill.hash,
        },
        "studio layout repair skill loaded",
      );
      studioLayoutRepairSkillLogged = true;
    }
    return cachedStudioLayoutRepairSkill;
  } catch (error) {
    cachedStudioLayoutRepairSkill = {
      path: null,
      body: STUDIO_LAYOUT_REPAIR_SKILL_FALLBACK,
      hash: sha1(STUDIO_LAYOUT_REPAIR_SKILL_FALLBACK),
      source: "fallback",
    };
    if (!studioLayoutRepairSkillLogged) {
      logger.warn(
        {
          skillPath,
          reason: error instanceof Error ? error.message : String(error),
        },
        "studio layout repair skill unavailable, using fallback instructions",
      );
      studioLayoutRepairSkillLogged = true;
    }
    return cachedStudioLayoutRepairSkill;
  }
}

export function loadStudioThinkingModeSkill(mode: DeckThinkingMode): LoadedStudioThinkingModeSkill | null {
  if (mode === "neutral") {
    return null;
  }

  const cached = cachedStudioThinkingModeSkills.get(mode);
  if (cached) {
    return cached;
  }

  const skillPath = getStudioThinkingModeSkillPath(mode);
  try {
    const raw = fs.readFileSync(skillPath, "utf8");
    const body = stripSkillFrontmatter(raw) || STUDIO_THINKING_MODE_SKILL_FALLBACKS[mode];
    const loadedSkill: LoadedStudioThinkingModeSkill = {
      mode,
      path: skillPath,
      body,
      hash: sha1(body),
      source: "file",
    };
    cachedStudioThinkingModeSkills.set(mode, loadedSkill);
    if (!studioThinkingModeSkillLogged.has(mode)) {
      logger.info(
        {
          mode,
          skillPath,
          skillHash: loadedSkill.hash,
        },
        "studio thinking mode skill loaded",
      );
      studioThinkingModeSkillLogged.add(mode);
    }
    return loadedSkill;
  } catch (error) {
    const body = STUDIO_THINKING_MODE_SKILL_FALLBACKS[mode];
    const loadedSkill: LoadedStudioThinkingModeSkill = {
      mode,
      path: null,
      body,
      hash: sha1(body),
      source: "fallback",
    };
    cachedStudioThinkingModeSkills.set(mode, loadedSkill);
    if (!studioThinkingModeSkillLogged.has(mode)) {
      logger.warn(
        {
          mode,
          skillPath,
          reason: error instanceof Error ? error.message : String(error),
        },
        "studio thinking mode skill unavailable, using fallback instructions",
      );
      studioThinkingModeSkillLogged.add(mode);
    }
    return loadedSkill;
  }
}

export function loadStudio3dHeroSkill(): LoadedStudio3dHeroSkill {
  if (cachedStudio3dHeroSkill) {
    return cachedStudio3dHeroSkill;
  }

  const skillPath = getStudio3dHeroSkillPath();
  const references = Object.keys(STUDIO_3D_HERO_REFERENCE_FALLBACKS).reduce(
    (accumulator, name) => {
      const referenceName = name as Studio3dHeroReferenceName;
      const referencePath = getStudio3dHeroReferencePath(referenceName);
      try {
        const raw = fs.readFileSync(referencePath, "utf8");
        const body = raw.trim() || STUDIO_3D_HERO_REFERENCE_FALLBACKS[referenceName];
        accumulator[referenceName] = {
          path: referencePath,
          body,
          hash: sha1(body),
          source: "file",
        };
      } catch {
        const body = STUDIO_3D_HERO_REFERENCE_FALLBACKS[referenceName];
        accumulator[referenceName] = {
          path: null,
          body,
          hash: sha1(body),
          source: "fallback",
        };
      }
      return accumulator;
    },
    {} as LoadedStudio3dHeroSkill["references"],
  );
  try {
    const raw = fs.readFileSync(skillPath, "utf8");
    const body = stripSkillFrontmatter(raw) || STUDIO_3D_HERO_SKILL_FALLBACK;
    cachedStudio3dHeroSkill = {
      path: skillPath,
      body,
      hash: sha1(body),
      source: "file",
      references,
    };
    if (!studio3dHeroSkillLogged) {
      logger.info(
        {
          skillPath,
          skillHash: cachedStudio3dHeroSkill.hash,
          heroReferenceCount: Object.keys(references).length,
        },
        "studio 3d hero skill loaded",
      );
      studio3dHeroSkillLogged = true;
    }
    return cachedStudio3dHeroSkill;
  } catch (error) {
    cachedStudio3dHeroSkill = {
      path: null,
      body: STUDIO_3D_HERO_SKILL_FALLBACK,
      hash: sha1(STUDIO_3D_HERO_SKILL_FALLBACK),
      source: "fallback",
      references,
    };
    if (!studio3dHeroSkillLogged) {
      logger.warn(
        {
          skillPath,
          reason: error instanceof Error ? error.message : String(error),
        },
        "studio 3d hero skill unavailable, using fallback instructions",
      );
      studio3dHeroSkillLogged = true;
    }
    return cachedStudio3dHeroSkill;
  }
}
