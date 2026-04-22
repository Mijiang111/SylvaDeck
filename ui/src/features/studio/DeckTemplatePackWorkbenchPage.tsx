import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  FolderCog,
  Layers3,
  LibraryBig,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "@/lib/router";
import {
  appendDeckTemplatePackPublishArtifact,
  deleteDeckTemplatePack,
  loadDeckTemplatePacks,
  saveDeckTemplatePack,
  summarizeDeckTemplatePack,
  validateDeckTemplatePack,
} from "./deck-template-packs";
import {
  createModuleAuthoringHandoffFromDeckTemplatePackPage,
  storeModuleAuthoringHandoff,
} from "./module-authoring-handoff";
import { importDeckTemplatePackFromPptx } from "./pptx-import";
import { createAssetRepository } from "./runtime/studio/repository";
import type {
  DeckTemplatePack,
  DeckTemplatePackPage,
  DeckTemplatePackPageRole,
  ImportedSourceObject,
  PackSemanticDecoration,
  PackSemanticSlot,
} from "./types";

const PACK_STAGE_LABELS = [
  { id: "import", label: "Import" },
  { id: "semanticize", label: "Semanticize" },
  { id: "workflow", label: "Workflow" },
  { id: "verify", label: "Verify" },
  { id: "publish", label: "Publish" },
] as const;

const PAGE_ROLE_OPTIONS: DeckTemplatePackPageRole[] = [
  "cover",
  "section",
  "content",
  "chart",
  "closing",
];

const SLOT_ROLE_OPTIONS: PackSemanticSlot["role"][] = [
  "page-title",
  "body",
  "support",
  "caption",
  "chart",
  "metric",
];

type CanvasViewMode = "semantic" | "source";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function trimText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not yet";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function toSentenceCase(value: string) {
  return value
    .split(/[-_]/g)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getPageObjectsById(page: DeckTemplatePackPage) {
  return new Map(page.sourceObjects.map((item) => [item.id, item] as const));
}

function getObjectFrame(page: DeckTemplatePackPage, objectIds: string[]) {
  const objectsById = getPageObjectsById(page);
  const objects = objectIds
    .map((id) => objectsById.get(id))
    .filter((item): item is ImportedSourceObject => Boolean(item));
  if (!objects.length) {
    return null;
  }

  const minX = Math.min(...objects.map((item) => item.x));
  const minY = Math.min(...objects.map((item) => item.y));
  const maxX = Math.max(...objects.map((item) => item.x + item.w));
  const maxY = Math.max(...objects.map((item) => item.y + item.h));

  return {
    x: minX,
    y: minY,
    w: Math.max(2, maxX - minX),
    h: Math.max(2, maxY - minY),
  };
}

function getStageState(pack: DeckTemplatePack | null) {
  if (!pack) {
    return PACK_STAGE_LABELS.map((stage, index) => ({
      ...stage,
      state: index === 0 ? "current" : "pending",
    }));
  }

  const validation = validateDeckTemplatePack(pack);
  const semanticized =
    pack.pages.length > 0 &&
    pack.pages.every((page) => page.semanticSlots.length > 0 || page.semanticDecorations.length > 0);
  const workflowReady =
    pack.pages.length > 0 &&
    pack.pages.every(
      (page) => Boolean(trimText(page.title)) && Boolean(trimText(page.reusablePattern)) && Boolean(trimText(page.briefHint)),
    );
  const published = pack.publishArtifacts.length > 0;

  return [
    { id: "import", label: "Import", state: "complete" },
    { id: "semanticize", label: "Semanticize", state: semanticized ? "complete" : "current" },
    {
      id: "workflow",
      label: "Workflow",
      state: semanticized && workflowReady ? "complete" : semanticized ? "current" : "pending",
    },
    {
      id: "verify",
      label: "Verify",
      state:
        semanticized && workflowReady && validation.blockingIssues.length === 0
          ? "complete"
          : semanticized
            ? "current"
            : "pending",
    },
    {
      id: "publish",
      label: "Publish",
      state: published ? "complete" : validation.blockingIssues.length === 0 ? "current" : "pending",
    },
  ] as const;
}

function renderChartPreview(object: Extract<ImportedSourceObject, { kind: "chart" }>) {
  const series = object.series[0]?.values ?? [];
  const maxValue = Math.max(...series, 1);
  return (
    <div className="flex h-full items-end gap-2 p-4">
      {series.slice(0, 6).map((value, index) => (
        <div key={`${object.id}-${index}`} className="flex-1">
          <div
            className="rounded-t-[10px] bg-[rgba(0,242,255,0.32)]"
            style={{ height: `${Math.max(12, (value / maxValue) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function renderImportedObject(args: {
  object: ImportedSourceObject;
  imageUrls: Record<string, string>;
}) {
  const { object, imageUrls } = args;
  const baseStyle = {
    left: object.x,
    top: object.y,
    width: Math.max(object.w, 2),
    height: Math.max(object.h, 2),
    opacity: object.opacity ?? 1,
    transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    transformOrigin: "center center",
  } as const;

  if (object.kind === "text") {
    return (
      <div
        key={object.id}
        className="absolute overflow-hidden whitespace-pre-wrap rounded-[12px] border border-[rgba(255,255,255,0.08)] px-3 py-2 leading-[1.2] text-[rgba(16,40,56,0.94)]"
        style={{
          ...baseStyle,
          fontSize: object.fontSize ?? 20,
          fontWeight: object.fontWeight ?? 500,
          fontStyle: object.italic ? "italic" : "normal",
          textAlign: object.align ?? "left",
          color: object.color ?? "#102838",
          background: object.fill ?? "rgba(255,255,255,0.72)",
          borderColor: object.stroke ?? "rgba(16,40,56,0.08)",
          borderWidth: object.strokeWidth ?? 1,
          borderRadius: object.radius ?? 12,
        }}
      >
        {object.text}
      </div>
    );
  }

  if (object.kind === "shape") {
    return (
      <div
        key={object.id}
        className="absolute"
        style={{
          ...baseStyle,
          background: object.fill ?? "rgba(233,238,242,0.92)",
          border: `${object.strokeWidth ?? 1}px solid ${object.stroke ?? "rgba(16,40,56,0.18)"}`,
          borderRadius: object.shape === "ellipse" ? "999px" : `${object.radius ?? 14}px`,
        }}
      />
    );
  }

  if (object.kind === "line") {
    return (
      <div key={object.id} className="absolute" style={baseStyle}>
        <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(object.w, 2)} ${Math.max(object.h, 2)}`}>
          <line
            x1="0"
            y1={Math.max(object.h, 2)}
            x2={Math.max(object.w, 2)}
            y2="0"
            stroke={object.stroke ?? "#A7B6BF"}
            strokeWidth={object.strokeWidth ?? 1.5}
          />
        </svg>
      </div>
    );
  }

  if (object.kind === "image") {
    return (
      <div
        key={object.id}
        className="absolute overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.08)]"
        style={baseStyle}
      >
        {imageUrls[object.id] ? (
          <img
            src={imageUrls[object.id]}
            alt={object.asset.alt ?? "Imported asset"}
            className="h-full w-full"
            style={{ objectFit: object.fit === "contain" ? "contain" : "cover" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] uppercase tracking-[0.22em] text-[var(--studio-muted)]">
            Image loading
          </div>
        )}
      </div>
    );
  }

  if (object.kind === "chart") {
    return (
      <div
        key={object.id}
        className="absolute overflow-hidden rounded-[18px] border border-[rgba(0,242,255,0.18)] bg-[linear-gradient(180deg,rgba(7,18,24,0.76)_0%,rgba(10,25,34,0.9)_100%)]"
        style={baseStyle}
      >
        <div className="border-b border-[rgba(255,255,255,0.08)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[rgba(255,255,255,0.72)]">
          {object.title || `${toSentenceCase(object.chartKind ?? "chart")} chart`}
        </div>
        {renderChartPreview(object)}
      </div>
    );
  }

  return (
    <div
      key={object.id}
      className="absolute rounded-[18px] border border-dashed border-[rgba(255,120,120,0.5)] bg-[rgba(92,18,18,0.24)] px-4 py-3 text-[13px] leading-5 text-[#ffd7d7]"
      style={baseStyle}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffb3b3]">
        {object.label}
      </div>
      <div className="mt-2">{object.reason}</div>
    </div>
  );
}

function PageCanvas(props: {
  pack: DeckTemplatePack;
  page: DeckTemplatePackPage;
  viewMode: CanvasViewMode;
  imageUrls: Record<string, string>;
}) {
  const { pack, page, viewMode, imageUrls } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: pack.pageWidth, height: pack.pageHeight });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(
    viewportSize.width / pack.pageWidth || 1,
    viewportSize.height / pack.pageHeight || 1,
  );

  const stageWidth = pack.pageWidth * scale;
  const stageHeight = pack.pageHeight * scale;

  return (
    <div
      ref={viewportRef}
      className="relative w-full overflow-hidden rounded-[28px] border border-[var(--studio-line)] bg-[rgba(3,12,20,0.72)]"
      style={{ aspectRatio: `${pack.pageWidth} / ${pack.pageHeight}` }}
    >
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden rounded-[22px] shadow-[0_28px_90px_rgba(0,0,0,0.35)]"
        style={{
          width: pack.pageWidth,
          height: pack.pageHeight,
          background: page.background,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <div className="absolute inset-0">
          {[...page.sourceObjects]
            .sort((left, right) => left.zIndex - right.zIndex)
            .map((object) => renderImportedObject({ object, imageUrls }))}
        </div>

        {viewMode === "semantic" ? (
          <>
            {page.semanticSlots.map((slot) => {
              const frame = getObjectFrame(page, slot.sourceObjectIds);
              if (!frame) {
                return null;
              }
              return (
                <div
                  key={slot.id}
                  className="absolute rounded-[18px] border-2 border-[rgba(0,242,255,0.56)] bg-[rgba(0,242,255,0.08)]"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.w,
                    height: frame.h,
                  }}
                >
                  <div className="absolute left-3 top-3 rounded-full border border-[rgba(0,242,255,0.24)] bg-[rgba(7,16,24,0.78)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(225,251,255,0.88)]">
                    {slot.kind} · {slot.label}
                  </div>
                </div>
              );
            })}

            {page.semanticDecorations.map((decoration) => {
              const frame = getObjectFrame(page, decoration.sourceObjectIds);
              if (!frame) {
                return null;
              }
              return (
                <div
                  key={decoration.id}
                  className="absolute rounded-[18px] border border-dashed border-[rgba(255,255,255,0.24)] bg-[rgba(10,16,24,0.12)]"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.w,
                    height: frame.h,
                  }}
                >
                  <div className="absolute bottom-3 left-3 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(7,16,24,0.78)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(255,255,255,0.7)]">
                    {decoration.label}
                  </div>
                </div>
              );
            })}

            {page.unresolvedObjectIds.map((objectId) => {
              const frame = getObjectFrame(page, [objectId]);
              if (!frame) {
                return null;
              }
              return (
                <div
                  key={objectId}
                  className="absolute rounded-[18px] border-2 border-[rgba(255,120,120,0.68)] bg-[rgba(114,24,24,0.12)]"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.w,
                    height: frame.h,
                  }}
                >
                  <div className="absolute left-3 top-3 rounded-full border border-[rgba(255,120,120,0.28)] bg-[rgba(62,10,10,0.85)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ffcece]">
                    Needs review
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="pointer-events-none absolute inset-0">
            {page.sourceObjects.map((object, index) => (
              <div
                key={`badge-${object.id}`}
                className="absolute rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(7,16,24,0.78)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(255,255,255,0.72)]"
                style={{
                  left: object.x + 8,
                  top: object.y + 8,
                }}
              >
                {index + 1} · {object.kind}
              </div>
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-5 right-5 rounded-full border border-[rgba(16,40,56,0.08)] bg-[rgba(255,255,255,0.74)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(16,40,56,0.72)]">
          {page.pageNumber} / {pack.pages.length}
        </div>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-[24px] border border-[rgba(255,255,255,0.06)]"
        style={{
          width: stageWidth,
          height: stageHeight,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

export function DeckTemplatePackWorkbenchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const assetRepository = useMemo(() => createAssetRepository(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const routePackId = params.packId ?? null;

  const [packs, setPacks] = useState<DeckTemplatePack[]>(() => loadDeckTemplatePacks());
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CanvasViewMode>("semantic");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Import a PPTX deck to create a semanticized template pack.");
  const [versionNote, setVersionNote] = useState("Imported deck release");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const currentPack = useMemo(
    () => (routePackId ? packs.find((pack) => pack.id === routePackId) ?? null : null),
    [packs, routePackId],
  );

  const currentPage =
    currentPack?.pages.find((page) => page.id === activePageId) ?? currentPack?.pages[0] ?? null;
  const validation = useMemo(
    () => (currentPack ? validateDeckTemplatePack(currentPack) : { blockingIssues: [], warningIssues: [] }),
    [currentPack],
  );
  const stageState = useMemo(() => getStageState(currentPack), [currentPack]);

  useEffect(() => {
    setPacks(loadDeckTemplatePacks());
  }, [location.pathname]);

  useEffect(() => {
    if (!currentPack) {
      setActivePageId(null);
      return;
    }
    if (!currentPack.pages.some((page) => page.id === activePageId)) {
      setActivePageId(currentPack.pages[0]?.id ?? null);
    }
  }, [activePageId, currentPack]);

  useEffect(() => {
    setVersionNote(
      currentPack?.publishArtifacts[0]
        ? `Follow-up to v${currentPack.publishArtifacts[0].version}`
        : "Imported deck release",
    );
  }, [currentPack?.id]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    async function loadImageUrls() {
      if (!currentPage) {
        setImageUrls({});
        return;
      }

      const next: Record<string, string> = {};
      for (const object of currentPage.sourceObjects) {
        if (object.kind !== "image") {
          continue;
        }
        const blob = await assetRepository.readBlob(object.asset.assetId);
        if (!blob) {
          continue;
        }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        next[object.id] = url;
      }
      if (!cancelled) {
        setImageUrls(next);
      }
    }

    loadImageUrls().catch(() => {
      if (!cancelled) {
        setImageUrls({});
      }
    });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assetRepository, currentPage]);

  function upsertPack(pack: DeckTemplatePack) {
    const saved = saveDeckTemplatePack(pack);
    setPacks((current) => {
      const exists = current.some((item) => item.id === saved.id);
      return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current];
    });
    return saved;
  }

  function updateCurrentPack(mutator: (pack: DeckTemplatePack) => DeckTemplatePack) {
    if (!currentPack) {
      return null;
    }
    return upsertPack(mutator(currentPack));
  }

  function updateCurrentPage(mutator: (page: DeckTemplatePackPage) => DeckTemplatePackPage) {
    if (!currentPack || !currentPage) {
      return null;
    }
    return updateCurrentPack((pack) => ({
      ...pack,
      pages: pack.pages.map((page) => (page.id === currentPage.id ? mutator(page) : page)),
    }));
  }

  async function handleImportFile(file: File) {
    setIsImporting(true);
    setImportError(null);
    setStatusLine(`Importing ${file.name} and building a deck template pack...`);

    try {
      const importedPack = await importDeckTemplatePackFromPptx({
        fileName: file.name,
        blob: file,
        saveAsset: async ({ blob, mimeType, alt }) => {
          const asset = await assetRepository.saveBlob({
            blob,
            mimeType,
            kind: "image",
          });
          return {
            assetId: asset.id,
            mimeType: asset.mimeType,
            size: asset.size,
            alt,
          };
        },
      });
      const savedPack = upsertPack(importedPack);
      setStatusLine(`${savedPack.label} imported with ${savedPack.pages.length} pages. Semantic view is ready to review.`);
      navigate(`/templates/packs/${savedPack.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PPTX import failed.";
      setImportError(message);
      setStatusLine(message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDeleteCurrentPack() {
    if (!currentPack) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete imported deck pack "${currentPack.label}"?`)
    ) {
      return;
    }
    deleteDeckTemplatePack(currentPack.id);
    setPacks((current) => current.filter((pack) => pack.id !== currentPack.id));
    setStatusLine(`${currentPack.label} was removed from the deck pack library.`);
    navigate("/templates/new");
  }

  function handleDeletePackFromList(pack: DeckTemplatePack) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete imported deck pack "${pack.label}"?`)
    ) {
      return;
    }
    deleteDeckTemplatePack(pack.id);
    setPacks((current) => current.filter((item) => item.id !== pack.id));
    if (pack.id === currentPack?.id) {
      navigate("/templates/new");
    }
  }

  function handleExtractLegacyPage() {
    if (!currentPack || !currentPage) {
      return;
    }
    const handoff = createModuleAuthoringHandoffFromDeckTemplatePackPage({
      packLabel: currentPack.label,
      page: currentPage,
    });
    const token = storeModuleAuthoringHandoff(handoff);
    setStatusLine(`${handoff.sourceLabel} Opening it in the legacy template lab.`);
    navigate(`/templates/legacy/new?extract=${token}&stage=${handoff.preferredStage}`);
  }

  function handlePublishPack() {
    if (!currentPack) {
      return;
    }
    const saved = appendDeckTemplatePackPublishArtifact({
      packId: currentPack.id,
      versionNote,
    });
    if (!saved) {
      return;
    }
    setPacks((current) => current.map((pack) => (pack.id === saved.id ? saved : pack)));
    setStatusLine(
      saved.publishArtifacts[0]?.result === "blocked"
        ? "Publish artifact recorded as blocked. Resolve blocking review items before shipping this pack."
        : `Pack release v${saved.publishArtifacts[0]?.version ?? 1} recorded.`,
    );
  }

  const currentSummary = currentPack ? summarizeDeckTemplatePack(currentPack) : null;

  return (
    <div className="studio-terminal-root min-h-screen overflow-y-auto px-6 py-8 text-[var(--studio-ink)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
        }}
      />

      <div className="mx-auto max-w-[1680px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/templates"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--studio-line)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
            >
              <ArrowLeft className="h-4 w-4 text-[var(--studio-accent)]" />
              Back to template library
            </Link>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Deck Template Pack Workbench
            </div>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
              Import a PPTX deck, auto-semanticize it, and turn it into a reusable author asset.
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--studio-muted-strong)]">
              The default path is now PPTX-first. Bring in a whole deck, review the semantic layer,
              shape the page workflow, and publish a pack without dropping back into raw geometry
              authoring unless you explicitly want the legacy lab.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-4 w-4 text-[var(--studio-accent)]" />
              {isImporting ? "Importing PPTX..." : "Import PPTX deck"}
            </button>
            <Link
              to="/templates/legacy/new"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--studio-line)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.04)]"
            >
              <Layers3 className="h-4 w-4 text-[var(--studio-muted)]" />
              Legacy manual template lab
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="space-y-4">
            <section className="studio-terminal-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                    Pack Library
                  </div>
                  <div className="mt-1 text-sm text-[var(--studio-muted-strong)]">
                    {packs.length} imported deck pack{packs.length === 1 ? "" : "s"}
                  </div>
                </div>
                <LibraryBig className="h-5 w-5 text-[var(--studio-accent)]" />
              </div>

              <div className="mt-4 space-y-3">
                {packs.length ? (
                  packs.map((pack) => {
                    const summary = summarizeDeckTemplatePack(pack);
                    const active = pack.id === currentPack?.id;
                    return (
                      <div
                        key={pack.id}
                        className={classNames(
                          "rounded-[20px] border px-4 py-3 transition",
                          active
                            ? "border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.08)]"
                            : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)]",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => navigate(`/templates/packs/${pack.id}`)}
                          className="w-full text-left"
                        >
                          <div className="text-sm font-semibold text-[var(--studio-ink)]">{pack.label}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                            {pack.sourceFileName} · {summary.pageCount} pages
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--studio-muted-strong)]">
                            <div>{summary.slotCount} slots</div>
                            <div>{summary.warningCount} warnings</div>
                            <div>{summary.unresolvedCount} unresolved</div>
                            <div>{summary.status}</div>
                          </div>
                        </button>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/templates/packs/${pack.id}`)}
                            className="inline-flex h-9 items-center rounded-full border border-[var(--studio-line)] px-3 text-xs font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePackFromList(pack)}
                            className="inline-flex h-9 items-center rounded-full border border-[rgba(255,100,100,0.35)] px-3 text-xs font-semibold text-[#ffaeae] transition hover:bg-[rgba(255,100,100,0.12)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[20px] border border-dashed border-[var(--studio-line)] px-4 py-6 text-sm leading-6 text-[var(--studio-muted-strong)]">
                    No deck packs yet. Import a PPTX to seed the library with a semanticized multi-page author asset.
                  </div>
                )}
              </div>
            </section>

            {currentPack ? (
              <section className="studio-terminal-panel p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                  Pages
                </div>
                <div className="mt-4 space-y-2">
                  {currentPack.pages.map((page) => {
                    const isActive = page.id === currentPage?.id;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setActivePageId(page.id)}
                        className={classNames(
                          "w-full rounded-[18px] border px-4 py-3 text-left transition",
                          isActive
                            ? "border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.08)]"
                            : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                              Page {page.pageNumber}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                              {page.title}
                            </div>
                          </div>
                          {page.unresolvedObjectIds.length > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-[#ffae6b]" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-[var(--studio-accent)]" />
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--studio-muted)]">
                          <span>{page.pageRole}</span>
                          <span>{page.semanticSlots.length} slots</span>
                          <span>{page.warnings.length} warnings</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </aside>

          <main className="space-y-4">
            <section className="studio-terminal-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  {stageState.map((stage) => (
                    <div
                      key={stage.id}
                      className={classNames(
                        "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                        stage.state === "complete"
                          ? "border-[rgba(0,242,255,0.26)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]"
                          : stage.state === "current"
                            ? "border-[rgba(216,164,95,0.24)] bg-[rgba(216,164,95,0.12)] text-[var(--studio-ink)]"
                            : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] text-[var(--studio-muted)]",
                      )}
                    >
                      {stage.label}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode("semantic")}
                    className={classNames(
                      "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                      viewMode === "semantic"
                        ? "border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]"
                        : "border-[var(--studio-line)] text-[var(--studio-muted-strong)] hover:bg-[rgba(255,255,255,0.04)]",
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                    Semantic view
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("source")}
                    className={classNames(
                      "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                      viewMode === "source"
                        ? "border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]"
                        : "border-[var(--studio-line)] text-[var(--studio-muted-strong)] hover:bg-[rgba(255,255,255,0.04)]",
                    )}
                  >
                    {viewMode === "source" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    Source view
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm leading-6 text-[var(--studio-muted-strong)]">
                {statusLine}
              </div>
              {importError ? (
                <div className="mt-3 rounded-[20px] border border-[rgba(255,120,120,0.28)] bg-[rgba(88,20,20,0.2)] px-4 py-3 text-sm leading-6 text-[#ffcccc]">
                  {importError}
                </div>
              ) : null}
            </section>

            {currentPack && currentPage ? (
              <>
                <section className="studio-terminal-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                        Current pack
                      </div>
                      <div className="mt-1 text-sm text-[var(--studio-muted-strong)]">
                        {currentPack.sourceFileName} · updated {formatTimestamp(currentPack.updatedAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--studio-line)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
                      >
                        <FileUp className="h-4 w-4 text-[var(--studio-accent)]" />
                        Import another deck
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCurrentPack}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(255,100,100,0.35)] px-4 text-sm font-semibold text-[#ffaeae] transition hover:bg-[rgba(255,100,100,0.12)]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete pack
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="border border-[var(--studio-line)] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        Pages
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                        {currentSummary?.pageCount ?? 0}
                      </div>
                    </div>
                    <div className="border border-[var(--studio-line)] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        Semantic slots
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                        {currentSummary?.slotCount ?? 0}
                      </div>
                    </div>
                    <div className="border border-[var(--studio-line)] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        Status
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                        {toSentenceCase(currentSummary?.status ?? "draft")}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="studio-terminal-panel p-4">
                  <PageCanvas
                    pack={currentPack}
                    page={currentPage}
                    viewMode={viewMode}
                    imageUrls={imageUrls}
                  />
                </section>
              </>
            ) : (
              <section className="studio-terminal-panel flex min-h-[640px] flex-col items-center justify-center px-8 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[rgba(0,242,255,0.18)] bg-[rgba(0,242,255,0.08)]">
                  <FolderCog className="h-8 w-8 text-[var(--studio-accent)]" />
                </div>
                <div className="mt-6 text-2xl font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
                  Start with a whole PPTX deck
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--studio-muted-strong)]">
                  The workbench will translate each slide into a source object layer plus a semantic
                  author layer. You review the recovered slots, decide page roles, and publish a
                  reusable deck pack without rebuilding the presentation from low-level shapes.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4 text-[var(--studio-accent)]" />
                  {isImporting ? "Importing PPTX..." : "Import your PPTX deck"}
                </button>
              </section>
            )}
          </main>

          <aside className="space-y-4">
            <section className="studio-terminal-panel p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                Pack Workflow
              </div>
              {currentPack ? (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      Pack name
                    </div>
                    <input
                      value={currentPack.label}
                      onChange={(event) => {
                        updateCurrentPack((pack) => ({
                          ...pack,
                          label: event.target.value,
                        }));
                      }}
                      className="mt-2 w-full rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                    />
                  </label>

                  {currentPage ? (
                    <>
                      <div className="border-t border-[var(--studio-line)] pt-4">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          Current page
                        </div>
                        <div className="mt-2 text-lg font-semibold text-[var(--studio-ink)]">
                          {currentPage.title}
                        </div>
                      </div>

                      <label className="block">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          Page title
                        </div>
                        <input
                          value={currentPage.title}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              title: event.target.value,
                            }));
                          }}
                          className="mt-2 w-full rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          Page role
                        </div>
                        <select
                          value={currentPage.pageRole}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              pageRole: event.target.value as DeckTemplatePackPageRole,
                            }));
                          }}
                          className="mt-2 w-full rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                        >
                          {PAGE_ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {toSentenceCase(role)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          Reusable page pattern
                        </div>
                        <input
                          value={currentPage.reusablePattern}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              reusablePattern: event.target.value,
                            }));
                          }}
                          className="mt-2 w-full rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          Brief mapping hint
                        </div>
                        <textarea
                          value={currentPage.briefHint}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              briefHint: event.target.value,
                            }));
                          }}
                          rows={4}
                          className="mt-2 w-full rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm leading-6 text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-[16px] border border-[var(--studio-line)] px-3 py-2.5">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                            Editable rule
                          </div>
                          <div className="mt-1 text-sm text-[var(--studio-muted-strong)]">
                            Semantic-only is the default first-pass authoring mode.
                          </div>
                        </div>
                        <select
                          value={currentPage.editableRule}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              editableRule:
                                event.target.value === "mixed" ? "mixed" : "semantic-only",
                            }));
                          }}
                          className="rounded-full border border-[var(--studio-line)] bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]"
                        >
                          <option value="semantic-only">Semantic only</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 text-sm leading-6 text-[var(--studio-muted-strong)]">
                  Import a deck pack to edit its workflow metadata and semantic page model here.
                </div>
              )}
            </section>

            {currentPage ? (
              <>
                <section className="studio-terminal-panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                      Semantic slots
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      {currentPage.semanticSlots.length}
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {currentPage.semanticSlots.map((slot) => (
                      <div key={slot.id} className="rounded-[18px] border border-[var(--studio-line)] px-4 py-3">
                        <input
                          value={slot.label}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              semanticSlots: page.semanticSlots.map((entry) =>
                                entry.id === slot.id ? { ...entry, label: event.target.value } : entry,
                              ),
                            }));
                          }}
                          className="w-full bg-transparent text-sm font-semibold text-[var(--studio-ink)] outline-none"
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <select
                            value={slot.role}
                            onChange={(event) => {
                              updateCurrentPage((page) => ({
                                ...page,
                                semanticSlots: page.semanticSlots.map((entry) =>
                                  entry.id === slot.id
                                    ? { ...entry, role: event.target.value as PackSemanticSlot["role"] }
                                    : entry,
                                ),
                              }));
                            }}
                            className="rounded-[14px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]"
                          >
                            {SLOT_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {toSentenceCase(role)}
                              </option>
                            ))}
                          </select>
                          <div className="rounded-[14px] border border-[var(--studio-line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                            {slot.kind}
                          </div>
                        </div>
                        <textarea
                          value={slot.notes ?? ""}
                          onChange={(event) => {
                            updateCurrentPage((page) => ({
                              ...page,
                              semanticSlots: page.semanticSlots.map((entry) =>
                                entry.id === slot.id ? { ...entry, notes: event.target.value } : entry,
                              ),
                            }));
                          }}
                          rows={3}
                          className="mt-3 w-full rounded-[14px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm leading-6 text-[var(--studio-muted-strong)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                        />
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          <label className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-line)] px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={slot.required}
                              onChange={(event) => {
                                updateCurrentPage((page) => ({
                                  ...page,
                                  semanticSlots: page.semanticSlots.map((entry) =>
                                    entry.id === slot.id ? { ...entry, required: event.target.checked } : entry,
                                  ),
                                }));
                              }}
                            />
                            Required
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-line)] px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={slot.canHide}
                              onChange={(event) => {
                                updateCurrentPage((page) => ({
                                  ...page,
                                  semanticSlots: page.semanticSlots.map((entry) =>
                                    entry.id === slot.id ? { ...entry, canHide: event.target.checked } : entry,
                                  ),
                                }));
                              }}
                            />
                            Can hide
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="studio-terminal-panel p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                    Decorations & review
                  </div>
                  <div className="mt-4 space-y-3">
                    {currentPage.semanticDecorations.map((decoration) => (
                      <div key={decoration.id} className="rounded-[18px] border border-[var(--studio-line)] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[var(--studio-ink)]">
                              {decoration.label}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                              {decoration.kind}
                            </div>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-line)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                            <input
                              type="checkbox"
                              checked={decoration.locked}
                              onChange={(event) => {
                                updateCurrentPage((page) => ({
                                  ...page,
                                  semanticDecorations: page.semanticDecorations.map((entry) =>
                                    entry.id === decoration.id
                                      ? { ...entry, locked: event.target.checked }
                                      : entry,
                                  ),
                                }));
                              }}
                            />
                            Locked
                          </label>
                        </div>
                      </div>
                    ))}
                    {currentPage.warnings.map((warning) => (
                      <div
                        key={warning.id}
                        className={classNames(
                          "rounded-[18px] border px-4 py-3 text-sm leading-6",
                          warning.severity === "blocking"
                            ? "border-[rgba(255,120,120,0.28)] bg-[rgba(88,20,20,0.18)] text-[#ffd2d2]"
                            : "border-[rgba(216,164,95,0.28)] bg-[rgba(88,58,18,0.18)] text-[#ffe6be]",
                        )}
                      >
                        {warning.message}
                      </div>
                    ))}
                    {!currentPage.semanticDecorations.length && !currentPage.warnings.length ? (
                      <div className="rounded-[18px] border border-[var(--studio-line)] px-4 py-3 text-sm leading-6 text-[var(--studio-muted-strong)]">
                        No decorative review items on this page.
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            <section className="studio-terminal-panel p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                Verify & publish
              </div>
              {currentPack ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[18px] border border-[var(--studio-line)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      Blocking issues
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[var(--studio-ink)]">
                      {validation.blockingIssues.length}
                    </div>
                    <div className="mt-3 space-y-2">
                      {validation.blockingIssues.length ? (
                        validation.blockingIssues.map((issue) => (
                          <div key={issue} className="text-sm leading-6 text-[#ffd2d2]">
                            {issue}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm leading-6 text-[var(--studio-muted-strong)]">
                          No blocking review items. This pack can record a publish artifact.
                        </div>
                      )}
                    </div>
                  </div>

                  {validation.warningIssues.length ? (
                    <div className="rounded-[18px] border border-[rgba(216,164,95,0.28)] bg-[rgba(88,58,18,0.18)] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[#ffe6be]">
                        Warnings
                      </div>
                      <div className="mt-2 space-y-2 text-sm leading-6 text-[#ffe6be]">
                        {validation.warningIssues.map((issue) => (
                          <div key={issue}>{issue}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <label className="block">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      Publish note
                    </div>
                    <input
                      value={versionNote}
                      onChange={(event) => setVersionNote(event.target.value)}
                      className="mt-2 w-full rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.24)]"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePublishPack}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.1)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                    >
                      <CheckCircle2 className="h-4 w-4 text-[var(--studio-accent)]" />
                      Record publish artifact
                    </button>
                    <button
                      type="button"
                      onClick={handleExtractLegacyPage}
                      disabled={!currentPage}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--studio-line)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
                      Extract page as legacy template
                    </button>
                  </div>

                  <div className="rounded-[18px] border border-[var(--studio-line)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      Recent publish history
                    </div>
                    <div className="mt-3 space-y-2">
                      {currentPack.publishArtifacts.length ? (
                        currentPack.publishArtifacts.map((artifact) => (
                          <div key={artifact.id} className="rounded-[14px] border border-[var(--studio-line)] px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-[var(--studio-ink)]">
                                v{artifact.version} · {toSentenceCase(artifact.result)}
                              </div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                                {formatTimestamp(artifact.publishedAt)}
                              </div>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-[var(--studio-muted-strong)]">
                              {artifact.versionNote}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm leading-6 text-[var(--studio-muted-strong)]">
                          No publish artifacts yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-sm leading-6 text-[var(--studio-muted-strong)]">
                  Verification and publish controls appear once a deck pack is loaded.
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
