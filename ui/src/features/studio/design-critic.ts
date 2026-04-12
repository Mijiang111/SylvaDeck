import type {
  GenerationDesignPlan,
  GenerationPageArchetypeDefinition,
  GenerationTemplateSkillDefinition,
} from "./generation-contract";
import type { SlideScene } from "./types";

export type SceneDesignIssue = {
  code:
    | "overcrowded-copy"
    | "repetitive-copy"
    | "unsafe-bounds"
    | "low-contrast"
    | "missing-dominant-zone"
    | "chrome-overload";
  severity: "warn" | "fail";
  detail: string;
};

function countWords(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/).filter(Boolean).length;
}

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value: string) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHexColor(value: string) {
  const hex = value.trim().replace("#", "");
  if (hex.length === 3) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    return parseHexColor(`#${expanded}`);
  }
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) {
    return null;
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function parseRgbColor(value: string) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const parts = match[1]
    .split(",")
    .map((item) => Number.parseFloat(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (parts.length < 3) {
    return null;
  }
  return {
    r: Math.min(255, Math.max(0, parts[0] ?? 0)),
    g: Math.min(255, Math.max(0, parts[1] ?? 0)),
    b: Math.min(255, Math.max(0, parts[2] ?? 0)),
  };
}

function parseColorChannels(value?: string | null) {
  if (!value) {
    return null;
  }
  return parseHexColor(value) ?? parseRgbColor(value);
}

function relativeLuminance(value?: string | null) {
  const channels = parseColorChannels(value);
  if (!channels) {
    return null;
  }
  const normalize = (channel: number) => {
    const next = channel / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  const r = normalize(channels.r);
  const g = normalize(channels.g);
  const b = normalize(channels.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground?: string | null, background?: string | null) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) {
    return null;
  }
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function collectSceneVisibleTexts(scene: SlideScene) {
  return scene.objects.flatMap((object) => {
    if (object.kind === "text") {
      return [object.text];
    }
    if (object.kind === "data") {
      const items = object.items ?? [];
      return [
        object.title ?? "",
        object.body ?? "",
        object.value ?? "",
        ...items.flatMap((item) => [item.eyebrow ?? "", item.title, item.body ?? "", item.value ?? ""]),
      ];
    }
    if (object.kind === "chart") {
      return [
        object.title ?? "",
        object.body ?? "",
        ...object.series.flatMap((item) => [item.label, item.value]),
      ];
    }
    return [];
  });
}

export function evaluateSceneDesignIssues(args: {
  scene: SlideScene;
  plan: GenerationDesignPlan;
  pageTitle: string;
  pageNote: string;
  pageArchetype: GenerationPageArchetypeDefinition;
  templateSkill: GenerationTemplateSkillDefinition;
}) {
  const issues: SceneDesignIssue[] = [];
  const visibleTexts = collectSceneVisibleTexts(args.scene).map((text) => sanitizeText(text)).filter(Boolean);
  const totalWords = visibleTexts.reduce((count, text) => count + countWords(text), 0);
  const budget = args.pageArchetype.copyBudget.totalVisibleWords;

  if (totalWords > Math.round(budget * 1.45)) {
    issues.push({
      code: "overcrowded-copy",
      severity: "fail",
      detail: `Visible copy is too dense for the archetype budget (${totalWords} words vs ${budget}).`,
    });
  }

  const duplicateCounts = new Map<string, number>();
  for (const text of visibleTexts) {
    const normalized = normalizeComparableText(text);
    if (!normalized || normalized.length < 20) {
      continue;
    }
    duplicateCounts.set(normalized, (duplicateCounts.get(normalized) ?? 0) + 1);
  }
  const repeatedVisibleCopy = [...duplicateCounts.values()].some((count) => count >= 2);
  const repeatedTitleCount = visibleTexts.filter(
    (text) => normalizeComparableText(text) === normalizeComparableText(args.pageTitle),
  ).length;
  const repeatedNoteCount = visibleTexts.filter(
    (text) => normalizeComparableText(text) === normalizeComparableText(args.pageNote),
  ).length;
  if (repeatedVisibleCopy || repeatedTitleCount >= 2 || repeatedNoteCount >= 2) {
    issues.push({
      code: "repetitive-copy",
      severity: "fail",
      detail: "Visible copy repeats the same title or note instead of building hierarchy.",
    });
  }

  const outOfBounds = args.scene.objects.some((object) => {
    if (object.x < -4 || object.y < -4) {
      return true;
    }
    if (object.x + object.w > args.scene.width + 4) {
      return true;
    }
    if (object.y + object.h > args.scene.height + 4) {
      return true;
    }
    return false;
  });
  if (outOfBounds) {
    issues.push({
      code: "unsafe-bounds",
      severity: "fail",
      detail: "One or more objects extend outside the slide frame.",
    });
  }

  const lowContrast = args.scene.objects.some((object) => {
    if (object.kind === "text") {
      const ratio = contrastRatio(object.color ?? args.templateSkill.theme.text, object.fill ?? args.scene.background);
      return ratio !== null && ratio < 3.2;
    }
    if (object.kind === "data" || object.kind === "chart") {
      const background = object.fill ?? args.scene.background;
      const ratio = contrastRatio(object.color ?? args.templateSkill.theme.text, background);
      return ratio !== null && ratio < 3.8;
    }
    return false;
  });
  if (lowContrast) {
    issues.push({
      code: "low-contrast",
      severity: "fail",
      detail: "A major text-bearing object is too low contrast to read comfortably.",
    });
  }

  const nonLineObjects = args.scene.objects.filter((object) => object.kind !== "line");
  const slideArea = args.scene.width * args.scene.height;
  const dominantShare = nonLineObjects.reduce((largest, object) => {
    const share = (object.w * object.h) / slideArea;
    return Math.max(largest, share);
  }, 0);
  if (dominantShare < 0.14 && nonLineObjects.length >= 5) {
    issues.push({
      code: "missing-dominant-zone",
      severity: "warn",
      detail: "The page lacks a strong dominant zone, so hierarchy may feel flat.",
    });
  }

  const chromeSurfaces = args.scene.objects.filter((object) => {
    if (object.kind === "rectangle" || object.kind === "ellipse") {
      return Boolean(object.fill);
    }
    if (object.kind === "data" || object.kind === "chart") {
      return Boolean(object.fill || object.stroke);
    }
    return false;
  }).length;
  if (chromeSurfaces >= 5) {
    issues.push({
      code: "chrome-overload",
      severity: "warn",
      detail: "Too many surfaced panels or shapes are competing with the content.",
    });
  }

  return issues;
}

export function hasSceneDesignFailure(issues: SceneDesignIssue[]) {
  return issues.some((issue) => issue.severity === "fail");
}
