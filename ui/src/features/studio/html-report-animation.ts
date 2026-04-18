import type {
  HtmlAnimationPage,
  HtmlAnimationStructure,
  HtmlAnimationEntryPreset,
  HtmlEntryTrack,
  HtmlLoopEffect,
  HtmlPageAnimationManifest,
} from "./types";

const ANCHOR_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const ENTRY_PRESETS = new Set<HtmlAnimationEntryPreset>([
  "fade-up",
  "fade-in",
  "slide-right",
  "slide-left",
  "scale-in",
  "chart-reveal",
]);
const LOOP_EFFECT_KINDS = new Set<HtmlLoopEffect["kind"]>([
  "rotate",
  "ticker",
  "typewriter",
  "pulse",
  "orbit",
]);

function normalizeAnchor(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return ANCHOR_PATTERN.test(normalized) ? normalized : null;
}

function normalizeInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }
  const normalized = Math.trunc(value as number);
  if (normalized < min || normalized > max) {
    return null;
  }
  return normalized;
}

function normalizeNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < min || value > max) {
    return null;
  }
  return value;
}

function normalizeStringArray(
  value: unknown,
  options?: { maxItems?: number; maxLength?: number },
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= (options?.maxLength ?? 120))
    .slice(0, options?.maxItems ?? value.length);
}

function normalizeEntryTrack(value: unknown): HtmlEntryTrack | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HtmlEntryTrack>;
  const anchor = normalizeAnchor(candidate.anchor);
  const preset =
    typeof candidate.preset === "string" && ENTRY_PRESETS.has(candidate.preset as HtmlAnimationEntryPreset)
      ? (candidate.preset as HtmlAnimationEntryPreset)
      : null;
  const delayMs = normalizeInteger(candidate.delayMs, 0, 4000);
  const durationMs = normalizeInteger(candidate.durationMs, 160, 10_000);
  const order = normalizeInteger(candidate.order, 0, 40);

  if (!anchor || !preset || delayMs === null || durationMs === null || order === null) {
    return null;
  }

  return {
    anchor,
    preset,
    delayMs,
    durationMs,
    order,
  };
}

function normalizeLoopEffect(value: unknown): HtmlLoopEffect | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { kind?: unknown; anchor?: unknown };
  const kind =
    typeof candidate.kind === "string" && LOOP_EFFECT_KINDS.has(candidate.kind as HtmlLoopEffect["kind"])
      ? (candidate.kind as HtmlLoopEffect["kind"])
      : null;
  const anchor = normalizeAnchor(candidate.anchor);
  if (!kind || !anchor) {
    return null;
  }

  if (kind === "rotate") {
    const rotate = value as Partial<Extract<HtmlLoopEffect, { kind: "rotate" }>>;
    const durationMs = normalizeInteger(rotate.durationMs, 160, 10_000);
    if (durationMs === null) {
      return null;
    }
    return {
      kind,
      anchor,
      durationMs,
      direction:
        rotate.direction === "counterclockwise" ? "counterclockwise" : "clockwise",
      angleDeg: normalizeNumber(rotate.angleDeg, 30, 1440) ?? undefined,
    };
  }

  if (kind === "ticker") {
    const ticker = value as Partial<Extract<HtmlLoopEffect, { kind: "ticker" }>>;
    const items = normalizeStringArray(ticker.items, { maxItems: 12, maxLength: 80 });
    const stepMs = normalizeInteger(ticker.stepMs, 160, 10_000);
    if (items.length === 0 || stepMs === null) {
      return null;
    }
    return {
      kind,
      anchor,
      items,
      stepMs,
    };
  }

  if (kind === "typewriter") {
    const typewriter = value as Partial<Extract<HtmlLoopEffect, { kind: "typewriter" }>>;
    const items = normalizeStringArray(typewriter.items, { maxItems: 12, maxLength: 80 });
    const typeMs = normalizeInteger(typewriter.typeMs, 16, 2000);
    const holdMs = normalizeInteger(typewriter.holdMs, 80, 10_000);
    const deleteMs = normalizeInteger(typewriter.deleteMs, 16, 2000);
    if (items.length === 0 || typeMs === null || holdMs === null || deleteMs === null) {
      return null;
    }
    return {
      kind,
      anchor,
      items,
      typeMs,
      holdMs,
      deleteMs,
    };
  }

  if (kind === "pulse") {
    const pulse = value as Partial<Extract<HtmlLoopEffect, { kind: "pulse" }>>;
    const durationMs = normalizeInteger(pulse.durationMs, 160, 10_000);
    if (durationMs === null) {
      return null;
    }
    return {
      kind,
      anchor,
      durationMs,
      scaleFrom: normalizeNumber(pulse.scaleFrom, 0.5, 1.5) ?? undefined,
      scaleTo: normalizeNumber(pulse.scaleTo, 0.5, 1.6) ?? undefined,
      opacityFrom: normalizeNumber(pulse.opacityFrom, 0.05, 1) ?? undefined,
      opacityTo: normalizeNumber(pulse.opacityTo, 0.05, 1) ?? undefined,
    };
  }

  const orbit = value as Partial<Extract<HtmlLoopEffect, { kind: "orbit" }>>;
  const durationMs = normalizeInteger(orbit.durationMs, 160, 10_000);
  const radiusPx = normalizeInteger(orbit.radiusPx, 2, 240);
  if (durationMs === null || radiusPx === null) {
    return null;
  }
  return {
    kind,
    anchor,
    durationMs,
    radiusPx,
    axis:
      orbit.axis === "x" || orbit.axis === "y" || orbit.axis === "xy"
        ? orbit.axis
        : "xy",
  };
}

function normalizeManifest(value: unknown, anchors: Set<string>): HtmlPageAnimationManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HtmlPageAnimationManifest>;
  if (candidate.version !== 1 || candidate.startMode !== "entry-then-loop") {
    return null;
  }

  const entryTracks = Array.isArray(candidate.entryTracks)
    ? candidate.entryTracks
        .map((entry) => normalizeEntryTrack(entry))
        .filter((entry): entry is HtmlEntryTrack => Boolean(entry))
        .filter((entry) => anchors.has(entry.anchor))
        .slice(0, 6)
    : [];
  const loopEffects = Array.isArray(candidate.loopEffects)
    ? candidate.loopEffects
        .map((effect) => normalizeLoopEffect(effect))
        .filter((effect): effect is HtmlLoopEffect => Boolean(effect))
        .filter((effect) => anchors.has(effect.anchor))
        .slice(0, 4)
    : [];

  return {
    version: 1,
    startMode: "entry-then-loop",
    ...(entryTracks.length > 0 ? { entryTracks } : {}),
    ...(loopEffects.length > 0 ? { loopEffects } : {}),
  };
}

function normalizeAnimationPage(
  value: unknown,
  options?: { pageCount?: number | null },
): HtmlAnimationPage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HtmlAnimationPage>;
  const pageNumber = normalizeInteger(
    candidate.pageNumber,
    1,
    options?.pageCount && options.pageCount >= 1 ? options.pageCount : 12,
  );
  if (pageNumber === null) {
    return null;
  }

  const anchors = Array.from(
    new Set(
      normalizeStringArray(candidate.anchors, { maxItems: 32, maxLength: 40 })
        .map((anchor) => normalizeAnchor(anchor))
        .filter((anchor): anchor is string => Boolean(anchor)),
    ),
  );
  const manifest = normalizeManifest(candidate.manifest, new Set(anchors));
  if (anchors.length === 0 && !manifest) {
    return null;
  }

  return {
    pageNumber,
    anchors,
    manifest,
  };
}

export function normalizeHtmlAnimationStructure(
  value: unknown,
  options?: { pageCount?: number | null },
): HtmlAnimationStructure | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const pages = Array.isArray((value as HtmlAnimationStructure).pages)
    ? (value as HtmlAnimationStructure).pages
        .map((page) => normalizeAnimationPage(page, options))
        .filter((page): page is HtmlAnimationPage => Boolean(page))
    : [];

  if (pages.length === 0) {
    return undefined;
  }

  const dedupedPages = Array.from(
    pages
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .reduce<Map<number, HtmlAnimationPage>>((accumulator, page) => {
        accumulator.set(page.pageNumber, page);
        return accumulator;
      }, new Map<number, HtmlAnimationPage>())
      .values(),
  );

  return {
    pages: dedupedPages,
  };
}

export function findHtmlAnimationPage(
  structure: HtmlAnimationStructure | null | undefined,
  pageNumber: number,
) {
  return structure?.pages.find((page) => page.pageNumber === pageNumber) ?? null;
}
