import { GENERATED_DRAFT_VERSION } from "./config";
import { normalizeSlideScene } from "./slide-scene";
import type {
  BlockDraft,
  DraftProvider,
  GeneratedHtmlReport,
  GeneratedDraftAsset,
  GeneratedDraftMode,
  MetricFact,
  NarrativeItem,
  PageDraft,
  SerializableWorkbenchDraft,
  TemplateId,
  WorkbenchDraft,
} from "./types";

function normalizeDraftText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampMetrics(metrics: MetricFact[]) {
  return metrics
    .map((metric) => ({
      value: normalizeDraftText(metric.value).slice(0, 32),
      label: normalizeDraftText(metric.label).slice(0, 160),
    }))
    .filter((metric) => metric.value && metric.label)
    .slice(0, 4);
}

function clampNarratives(items: NarrativeItem[]) {
  return items
    .map((item) => ({
      title: normalizeDraftText(item.title).slice(0, 80),
      body: normalizeDraftText(item.body).slice(0, 220),
    }))
    .filter((item) => item.title && item.body)
    .slice(0, 4);
}

export function draftFromSerializable(
  payload: SerializableWorkbenchDraft,
  provider: DraftProvider
): WorkbenchDraft {
  return {
    title: normalizeDraftText(payload.title) || "Untitled report",
    subtitle:
      typeof payload.subtitle === "string" &&
      normalizeDraftText(payload.subtitle)
        ? normalizeDraftText(payload.subtitle)
        : "Generated draft",
    provider,
    pageDrafts: new Map(
      payload.pageDrafts.map((pageDraft) => {
        const serializedBlocks = Array.isArray(pageDraft.blocks)
          ? pageDraft.blocks
          : [];

        return [
          pageDraft.pageId,
          {
            summary:
              typeof pageDraft.summary === "string" &&
              normalizeDraftText(pageDraft.summary)
                ? normalizeDraftText(pageDraft.summary)
                : "Generated page summary",
            scene: normalizeSlideScene(pageDraft.scene),
            markdown:
              typeof pageDraft.markdown === "string" &&
              pageDraft.markdown.trim()
                ? pageDraft.markdown
                : undefined,
            blocks: Object.fromEntries(
              serializedBlocks.map((blockDraft) => [
                blockDraft.blockId,
                {
                  summary:
                    normalizeDraftText(blockDraft.summary) ||
                    "Generated block summary",
                  metrics: clampMetrics(blockDraft.metrics),
                  cards: clampNarratives(blockDraft.cards),
                  steps: clampNarratives(blockDraft.steps),
                } satisfies BlockDraft,
              ])
            ),
            blockMarkdown: Object.fromEntries(
              serializedBlocks
                .filter(
                  (blockDraft) =>
                    (typeof blockDraft.markdown === "string" &&
                      blockDraft.markdown.trim()) ||
                    (Array.isArray(blockDraft.adapterWarnings) &&
                      blockDraft.adapterWarnings.length > 0)
                )
                .map((blockDraft) => [
                  blockDraft.blockId,
                  {
                    markdown:
                      typeof blockDraft.markdown === "string"
                        ? blockDraft.markdown
                        : "",
                    adapterWarnings: Array.isArray(blockDraft.adapterWarnings)
                      ? blockDraft.adapterWarnings.filter(
                          (warning): warning is string =>
                            typeof warning === "string" &&
                            warning.trim().length > 0
                        )
                      : [],
                  },
                ])
            ),
          } satisfies PageDraft,
        ];
      })
    ),
  };
}

export function serializeDraft(
  draft: WorkbenchDraft
): SerializableWorkbenchDraft {
  return {
    title: draft.title,
    subtitle: draft.subtitle,
    pageDrafts: Array.from(draft.pageDrafts.entries()).map(
      ([pageId, pageDraft]) => ({
        pageId,
        summary: pageDraft.summary,
        scene: pageDraft.scene ? normalizeSlideScene(pageDraft.scene) : undefined,
        markdown: pageDraft.markdown,
        blocks: Object.entries(pageDraft.blocks).map(
          ([blockId, blockDraft]) => ({
            blockId,
            summary: blockDraft.summary,
            metrics: clampMetrics(blockDraft.metrics),
            cards: clampNarratives(blockDraft.cards),
            steps: clampNarratives(blockDraft.steps),
            markdown: pageDraft.blockMarkdown?.[blockId]?.markdown,
            adapterWarnings:
              pageDraft.blockMarkdown?.[blockId]?.adapterWarnings ?? [],
          })
        ),
      })
    ),
  };
}

export function hydrateDraftAsset(asset: GeneratedDraftAsset): WorkbenchDraft {
  return draftFromSerializable(asset.draft, asset.provider);
}

export function createGeneratedDraftAsset(args: {
  draft: WorkbenchDraft;
  signature: string;
  templateId: TemplateId;
  provider: DraftProvider;
  mode?: GeneratedDraftMode;
  model?: string | null;
  generatedAt?: string;
  htmlReport?: GeneratedHtmlReport;
}): GeneratedDraftAsset {
  return {
    version: GENERATED_DRAFT_VERSION,
    templateId: args.templateId,
    provider: args.provider,
    mode: args.mode ?? "content",
    model: args.model ?? null,
    signature: args.signature,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    draft: serializeDraft(args.draft),
    htmlReport: args.htmlReport,
  };
}

export function canReuseGeneratedDraft(
  asset: GeneratedDraftAsset | null | undefined,
  signature: string,
  templateId: TemplateId,
  mode: GeneratedDraftMode = "content"
) {
  return Boolean(
    asset &&
      asset.templateId === templateId &&
      asset.mode === mode &&
      asset.signature === signature &&
      asset.draft.pageDrafts.length > 0
  );
}
