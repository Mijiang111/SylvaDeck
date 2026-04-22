import type { Dispatch, SetStateAction } from "react";
import { BarChart3, Database, Sparkles, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type {
  ModuleAiState,
  ModuleCanvasObjectKind,
  ModuleChartKind,
  ModuleConnection,
  ModuleRegistryEntry,
  ModuleTemplateField,
} from "@/features/studio/types";
import { isAiTextField, isSquareTemplateField } from "@/features/studio/module-fields";
import { CHART_KIND_LABEL } from "../authoring-constants";
import {
  CHART_SERIES_COLORS,
  deriveChartPreview,
  getChartKind,
  getChartStatusMessage,
} from "../chart-preview";
import {
  clamp,
  clampLayoutToSurface,
  createDefaultFieldLayout,
  createEmptyDataTable,
  getCanvasObjectKind,
  getConnectionKindLabel,
  getFieldKindTone,
  getFieldSurface,
  getObjectKindLabel,
  MODULE_CANVAS_COLUMNS,
  MODULE_CANVAS_ROWS,
  MODULE_SCENE_COLUMNS,
  MODULE_SCENE_ROWS,
} from "../helpers";
import {
  getFieldOutputFormat,
  getFieldOutputLength,
  getOutputContractFormatOptions,
  OUTPUT_CONTRACT_FORMAT_LABEL,
  OUTPUT_CONTRACT_LENGTH_LABEL,
} from "../output-contract";

type ComposeStagePanelView = {
  draft: ModuleRegistryEntry;
  selectedFieldIds: string[];
  selectedFieldCount: number;
  selectedField: ModuleTemplateField | null;
  selectedObjectKind: ModuleCanvasObjectKind | null;
  selectedOutputField: ModuleTemplateField | null;
  selectedConnections: ModuleConnection[];
  chartPreviewByFieldId: Map<string, ReturnType<typeof deriveChartPreview>>;
  chartSourceByFieldId: Map<string, ModuleTemplateField | null>;
};

type ComposeStagePanelActions = {
  handleFieldSelection: (fieldId: string, additive: boolean) => void;
  saveSelectedAsModule: () => void;
  updateDraftFieldById: (
    fieldId: string,
    updater: (field: ModuleTemplateField) => ModuleTemplateField
  ) => void;
  updateFieldAiState: (fieldId: string, aiState: ModuleAiState) => void;
  updateFieldOutputContract: (
    fieldId: string,
    updater: (contract: NonNullable<ModuleTemplateField["outputContract"]>) => NonNullable<ModuleTemplateField["outputContract"]>
  ) => void;
  updateDataBlockRaw: (fieldId: string, raw: string) => void;
  updateChartKind: (fieldId: string, kind: ModuleChartKind) => void;
  removeConnection: (connectionId: string) => void;
  setDraft: Dispatch<SetStateAction<ModuleRegistryEntry>>;
};

type ComposeStagePanelProps = {
  view: ComposeStagePanelView;
  actions: ComposeStagePanelActions;
};

export function ComposeStagePanel({ view, actions }: ComposeStagePanelProps) {
  const {
    draft,
    selectedFieldIds,
    selectedFieldCount,
    selectedField,
    selectedObjectKind,
    selectedOutputField,
    selectedConnections,
    chartPreviewByFieldId,
    chartSourceByFieldId,
  } = view;
  const {
    handleFieldSelection,
    saveSelectedAsModule,
    updateDraftFieldById,
    updateFieldAiState,
    updateFieldOutputContract,
    updateDataBlockRaw,
    updateChartKind,
    removeConnection,
    setDraft,
  } = actions;
  return (
    <>
                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Template primitives
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                      Authoring legend
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {[
                      {
                        label: "AI Text",
                        detail: "Semantic slot. AI writes here and this becomes part of the published slot contract.",
                      },
                      {
                        label: "Locked Text",
                        detail: "Template-owned copy. Use for labels, dividers, captions, and fixed headings.",
                      },
                      {
                        label: "Data / Chart",
                        detail: "Evidence containers. Charts can publish as slots; raw data stays support-only unless summarized.",
                      },
                      {
                        label: "Shape / Line",
                        detail: "Pure structure and decoration. They should guide the page without becoming AI content slots.",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                      >
                        <div className="text-sm font-semibold text-white">
                          {item.label}
                        </div>
                        <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Template objects
                    </div>
                    <div className="text-[10px] text-[#627987]">
                      {draft.fields.length}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1">
                    {draft.fields.map((field) => {
                      const isSelected = selectedFieldIds.includes(field.id);
                      return (
                        <button
                          key={field.id}
                          type="button"
                          onClick={(event) =>
                            handleFieldSelection(
                              field.id,
                              event.metaKey || event.ctrlKey
                            )
                          }
                          className={[
                            "flex w-full items-center gap-2 border-l-2 px-2.5 py-2 text-left transition",
                            isSelected
                              ? "bg-[#132231] text-white"
                              : "text-[#d9e7ef] hover:bg-white/[0.04]",
                            isSelected
                              ? "border-[#6bb7ff]"
                              : "border-transparent",
                          ].join(" ")}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              background:
                                field.style?.fill ??
                                (getCanvasObjectKind(field) === "text"
                                  ? "#d9e7ef"
                                  : "#9bb6c2"),
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium">
                              {field.label}
                            </div>
                          </div>
                          {field.groupId ? (
                            <span className="text-[10px] uppercase tracking-[0.16em] text-[#7f95a6]">
                              G
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Selected object
                    </div>
                    {selectedFieldCount > 0 ? (
                      <button
                        type="button"
                        onClick={saveSelectedAsModule}
                        className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9cb2be] transition hover:text-white"
                      >
                        Save as template
                      </button>
                    ) : null}
                  </div>
                  {selectedField ? (
                    <div className="mt-3 space-y-3">
                      {selectedFieldCount > 1 ? (
                        <div className="text-[11px] leading-5 text-[#7f95a6]">
                          Editing the primary object in a {selectedFieldCount}
                          -object selection.
                        </div>
                      ) : null}
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[#7f95a6]">
                        {selectedField ? getFieldKindTone(selectedField) : ""}
                      </div>
                      <input
                        value={selectedField.label}
                        onChange={(event) =>
                          updateDraftFieldById(selectedField.id, (field) => ({
                            ...field,
                            label: event.target.value,
                          }))
                        }
                        className="h-9 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                      />
                      {selectedField.importSource ? (
                        <div className="rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                Imported source
                              </div>
                              <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                                {selectedField.importSource.sourceFileName} · slide{" "}
                                {selectedField.importSource.slideNumber} ·{" "}
                                {selectedField.importSource.sourceObjectKind}
                              </div>
                            </div>
                            <div
                              className={[
                                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                selectedField.importSource.reviewState === "needs-review"
                                  ? "border border-[rgba(216,164,95,0.3)] bg-[rgba(216,164,95,0.12)] text-[#f3c992]"
                                  : "border border-[rgba(49,212,194,0.28)] bg-[rgba(49,212,194,0.12)] text-[#8af0e4]",
                              ].join(" ")}
                            >
                              {selectedField.importSource.reviewState === "needs-review"
                                ? "Blocks publish"
                                : "Imported"}
                            </div>
                          </div>
                          {selectedField.importSource.reviewNote ? (
                            <div className="mt-3 text-[12px] leading-5 text-[#d7b07a]">
                              {selectedField.importSource.reviewNote}
                            </div>
                          ) : null}
                          {selectedObjectKind === "image" ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {(["cover", "contain"] as const).map((fit) => {
                                const isActive =
                                  (selectedField.imageFit ?? "cover") === fit;
                                return (
                                  <button
                                    key={fit}
                                    type="button"
                                    onClick={() =>
                                      updateDraftFieldById(selectedField.id, (field) => ({
                                        ...field,
                                        imageFit: fit,
                                      }))
                                    }
                                    className={[
                                      "inline-flex h-9 items-center justify-center border px-3 text-sm font-semibold transition",
                                      isActive
                                        ? "border-white bg-white text-[#0b1117]"
                                        : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                    ].join(" ")}
                                  >
                                    {fit === "cover" ? "Cover frame" : "Contain image"}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {selectedObjectKind === "slot" && (
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            {
                              label: "AI fills",
                              value: "ai-fill" as const,
                              icon: Sparkles,
                            },
                            {
                              label: "From data",
                              value: "summarize-linked-data" as const,
                              icon: Database,
                            },
                          ].map((option) => {
                            const Icon = option.icon;
                            const isActive =
                              (selectedField.aiState ?? "locked") ===
                              option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  updateFieldAiState(
                                    selectedField.id,
                                    option.value
                                  )
                                }
                                className={[
                                  "inline-flex h-10 items-center justify-center gap-2 border px-3 text-sm font-semibold transition",
                                  isActive
                                    ? "border-white bg-white text-[#0b1117]"
                                    : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                ].join(" ")}
                              >
                                <Icon className="h-4 w-4" />
                                <span>{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(selectedObjectKind === "slot" ||
                        selectedObjectKind === "chart" ||
                        selectedObjectKind === "data" ||
                        (selectedObjectKind === "text" &&
                          isAiTextField(selectedField))) ? (
                        <label className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              Required slot
                            </div>
                            <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                              Required slots must match the page mission. Optional slots may be hidden when content is weak.
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedField.required}
                            onChange={(event) =>
                              updateDraftFieldById(selectedField.id, (field) => ({
                                ...field,
                                required: event.target.checked,
                              }))
                            }
                            className="h-4 w-4 accent-[#31d4c2]"
                          />
                        </label>
                      ) : (
                        <div className="rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3 text-[12px] leading-5 text-[#8ca3b2]">
                          This object is decoration-only. It helps shape the template, but it will not become an AI fill slot.
                        </div>
                      )}

                      {selectedOutputField ? (
                        <div className="space-y-3 border border-white/8 bg-white/[0.02] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                AI result
                              </div>
                              <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                                Define what should come out of this block. Flow
                                will reason toward this result later.
                              </div>
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[#95a3c9]">
                              {
                                OUTPUT_CONTRACT_FORMAT_LABEL[
                                  getFieldOutputFormat(selectedOutputField)
                                ]
                              }
                            </div>
                          </div>
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              What should come out
                            </div>
                            <Textarea
                              value={
                                selectedOutputField.outputContract?.goal ?? ""
                              }
                              onChange={(event) =>
                                updateFieldOutputContract(
                                  selectedOutputField.id,
                                  (contract) => ({
                                    ...contract,
                                    goal: event.target.value,
                                  })
                                )
                              }
                              placeholder={
                                selectedObjectKind === "chart"
                                  ? "State the chart story this block should land."
                                  : "State the takeaway this block should output. Leave blank to inherit the block role."
                              }
                              className="min-h-[96px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
                            />
                          </label>
                          <div>
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Present as
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {getOutputContractFormatOptions(
                                selectedOutputField
                              ).map((format) => {
                                const isActive =
                                  getFieldOutputFormat(selectedOutputField) ===
                                  format;
                                return (
                                  <button
                                    key={`${selectedOutputField.id}-${format}`}
                                    type="button"
                                    onClick={() =>
                                      updateFieldOutputContract(
                                        selectedOutputField.id,
                                        (contract) => ({
                                          ...contract,
                                          format,
                                        })
                                      )
                                    }
                                    className={[
                                      "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold transition",
                                      isActive
                                        ? "border-white bg-white text-[#0b1117]"
                                        : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                    ].join(" ")}
                                  >
                                    {OUTPUT_CONTRACT_FORMAT_LABEL[format]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Density
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(["tight", "short", "full"] as const).map(
                                (length) => {
                                  const isActive =
                                    getFieldOutputLength(
                                      selectedOutputField
                                    ) === length;
                                  return (
                                    <button
                                      key={`${selectedOutputField.id}-${length}`}
                                      type="button"
                                      onClick={() =>
                                        updateFieldOutputContract(
                                          selectedOutputField.id,
                                          (contract) => ({
                                            ...contract,
                                            length,
                                          })
                                        )
                                      }
                                      className={[
                                        "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold transition",
                                        isActive
                                          ? "border-white bg-white text-[#0b1117]"
                                          : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                      ].join(" ")}
                                    >
                                      {OUTPUT_CONTRACT_LENGTH_LABEL[length]}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          </div>
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Must show
                            </div>
                            <input
                              value={
                                selectedOutputField.outputContract
                                  ?.mustInclude ?? ""
                              }
                              onChange={(event) =>
                                updateFieldOutputContract(
                                  selectedOutputField.id,
                                  (contract) => ({
                                    ...contract,
                                    mustInclude: event.target.value,
                                  })
                                )
                              }
                              placeholder="Required term, number, or angle"
                              className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            />
                          </label>
                        </div>
                      ) : null}

                      {selectedObjectKind === "data" ? (
                        <div className="space-y-3 border border-white/8 bg-white/[0.02] px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                Data source
                              </div>
                              <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                                Paste rows straight from Excel or CSV. The block
                                will infer headers and value types for you.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                updateDataBlockRaw(
                                  selectedField.id,
                                  createEmptyDataTable().raw
                                )
                              }
                              className="inline-flex h-9 items-center justify-center border border-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/[0.05]"
                            >
                              Reset
                            </button>
                          </div>
                          <Textarea
                            value={selectedField.dataTable?.raw ?? ""}
                            onChange={(event) =>
                              updateDataBlockRaw(
                                selectedField.id,
                                event.target.value
                              )
                            }
                            placeholder={
                              "Label\tValue\nNorth America\t42\nEurope\t34"
                            }
                            className="min-h-[132px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div className="border border-white/8 px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                                Columns
                              </div>
                              <div className="mt-1 text-sm font-semibold text-white">
                                {selectedField.dataTable?.columns.length ?? 0}
                              </div>
                            </div>
                            <div className="border border-white/8 px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                                Rows
                              </div>
                              <div className="mt-1 text-sm font-semibold text-white">
                                {selectedField.dataTable?.rows.length ?? 0}
                              </div>
                            </div>
                            <div className="border border-white/8 px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                                Links
                              </div>
                              <div className="mt-1 text-sm font-semibold text-white">
                                {selectedConnections.length}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(selectedField.dataTable?.columns ?? []).map(
                              (column) => (
                                <span
                                  key={column.id}
                                  className="border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cbd8de]"
                                >
                                  {column.label} · {column.type}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      ) : null}

                      {selectedObjectKind === "chart" ? (
                        <div className="space-y-3 border border-white/8 bg-white/[0.02] px-3 py-3">
                          {(() => {
                            const preview =
                              chartPreviewByFieldId.get(selectedField.id) ??
                              deriveChartPreview(
                                selectedField,
                                chartSourceByFieldId.get(selectedField.id) ??
                                  null
                              );
                            return (
                              <>
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-white">
                                      Chart source
                                    </div>
                                    <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                                      Flow mode decides which data block drives
                                      this chart. You pick the story shape here,
                                      while the data columns stay inferred.
                                    </div>
                                  </div>
                                  <BarChart3 className="h-4 w-4 text-[#d8a45f]" />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  {(
                                    ["bar", "stacked", "waterfall"] as const
                                  ).map((kind) => {
                                    const isActive =
                                      getChartKind(selectedField) === kind;
                                    return (
                                      <button
                                        key={kind}
                                        type="button"
                                        onClick={() =>
                                          updateChartKind(
                                            selectedField.id,
                                            kind
                                          )
                                        }
                                        className={[
                                          "inline-flex h-10 items-center justify-center border px-3 text-sm font-semibold transition",
                                          isActive
                                            ? "border-white bg-white text-[#0b1117]"
                                            : "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
                                        ].join(" ")}
                                      >
                                        {CHART_KIND_LABEL[kind]}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="border border-white/8 px-3 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                                      Source
                                    </div>
                                    <div className="mt-1 truncate text-sm font-semibold text-white">
                                      {chartSourceByFieldId.get(
                                        selectedField.id
                                      )?.label ?? "None"}
                                    </div>
                                  </div>
                                  <div className="border border-white/8 px-3 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                                      Status
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-white">
                                      {preview.status === "ready"
                                        ? "Ready"
                                        : getChartStatusMessage(preview)}
                                    </div>
                                  </div>
                                  <div className="border border-white/8 px-3 py-3">
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                                      Mode
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-white">
                                      {CHART_KIND_LABEL[preview.kind]}
                                    </div>
                                  </div>
                                </div>
                                {preview.kind === "stacked" &&
                                preview.seriesLabels.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {preview.seriesLabels.map(
                                      (label, index) => (
                                        <span
                                          key={`${selectedField.id}-series-${label}`}
                                          className="inline-flex items-center gap-1.5 border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cbd8de]"
                                        >
                                          <span
                                            className="inline-block h-2.5 w-2.5 rounded-full"
                                            style={{
                                              background:
                                                CHART_SERIES_COLORS[
                                                  index %
                                                    CHART_SERIES_COLORS.length
                                                ],
                                            }}
                                          />
                                          {label}
                                        </span>
                                      )
                                    )}
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      ) : null}

                      {selectedConnections.length > 0 ? (
                        <div className="border border-white/8 bg-transparent px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                            Connections
                          </div>
                          <div className="mt-3 space-y-2">
                            {selectedConnections.map((connection) => {
                              const peerId =
                                connection.sourceFieldId === selectedField.id
                                  ? connection.targetFieldId
                                  : connection.sourceFieldId;
                              const peer =
                                draft.fields.find(
                                  (field) => field.id === peerId
                                ) ?? null;
                              return (
                                <div
                                  key={connection.id}
                                  className="flex items-center justify-between gap-3 border border-white/8 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-white">
                                      {peer?.label ?? "Missing block"}
                                    </div>
                                    <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#7f95a6]">
                                      {getConnectionKindLabel(connection.kind)}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeConnection(connection.id)
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-[#9cb2be] transition hover:bg-white/[0.05] hover:text-white"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {selectedObjectKind !== "slot" &&
                      selectedObjectKind !== "data" &&
                      selectedObjectKind !== "chart" ? (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedObjectKind !== "line" ? (
                            <label className="block">
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                                Fill
                              </div>
                              <div className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-2.5 py-2">
                                <input
                                  type="color"
                                  value={
                                    selectedField.style?.fill ??
                                    (selectedObjectKind === "text"
                                      ? "#173043"
                                      : "#dce9ee")
                                  }
                                  onChange={(event) =>
                                    updateDraftFieldById(
                                      selectedField.id,
                                      (field) => ({
                                        ...field,
                                        style: {
                                          ...field.style,
                                          fill: event.target.value,
                                        },
                                      })
                                    )
                                  }
                                  className="h-5 w-5 rounded border-0 bg-transparent p-0"
                                />
                                <input
                                  value={
                                    selectedField.style?.fill ??
                                    (selectedObjectKind === "text"
                                      ? "#173043"
                                      : "#dce9ee")
                                  }
                                  onChange={(event) =>
                                    updateDraftFieldById(
                                      selectedField.id,
                                      (field) => ({
                                        ...field,
                                        style: {
                                          ...field.style,
                                          fill: event.target.value,
                                        },
                                      })
                                    )
                                  }
                                  className="w-full bg-transparent text-[12px] text-white outline-none"
                                />
                              </div>
                            </label>
                          ) : null}
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Stroke
                            </div>
                            <div className="flex items-center gap-2 border border-white/10 bg-white/[0.03] px-2.5 py-2">
                              <input
                                type="color"
                                value={selectedField.style?.stroke ?? "#9bb6c2"}
                                onChange={(event) =>
                                  updateDraftFieldById(
                                    selectedField.id,
                                    (field) => ({
                                      ...field,
                                      style: {
                                        ...field.style,
                                        stroke: event.target.value,
                                      },
                                    })
                                  )
                                }
                                className="h-5 w-5 rounded border-0 bg-transparent p-0"
                              />
                              <input
                                value={selectedField.style?.stroke ?? "#9bb6c2"}
                                onChange={(event) =>
                                  updateDraftFieldById(
                                    selectedField.id,
                                    (field) => ({
                                      ...field,
                                      style: {
                                        ...field.style,
                                        stroke: event.target.value,
                                      },
                                    })
                                  )
                                }
                                className="w-full bg-transparent text-[12px] text-white outline-none"
                              />
                            </div>
                          </label>
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Stroke width
                            </div>
                            <input
                              type="number"
                              min={1}
                              max={24}
                              value={selectedField.style?.strokeWidth ?? 1}
                              onChange={(event) =>
                                updateDraftFieldById(
                                  selectedField.id,
                                  (field) => ({
                                    ...field,
                                    style: {
                                      ...field.style,
                                      strokeWidth: clamp(
                                        Number(event.target.value || 1),
                                        1,
                                        24
                                      ),
                                    },
                                  })
                                )
                              }
                              className="h-9 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Stroke style
                            </div>
                            <select
                              value={selectedField.style?.strokeStyle ?? "solid"}
                              onChange={(event) =>
                                updateDraftFieldById(
                                  selectedField.id,
                                  (field) => ({
                                    ...field,
                                    style: {
                                      ...field.style,
                                      strokeStyle: event.target.value as NonNullable<
                                        ModuleTemplateField["style"]
                                      >["strokeStyle"],
                                    },
                                  })
                                )
                              }
                              className="h-9 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            >
                              <option value="solid">Solid</option>
                              <option value="dashed">Dashed</option>
                            </select>
                          </label>
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Angle
                            </div>
                            <input
                              type="number"
                              min={-180}
                              max={180}
                              value={selectedField.style?.rotation ?? 0}
                              onChange={(event) =>
                                updateDraftFieldById(
                                  selectedField.id,
                                  (field) => ({
                                    ...field,
                                    style: {
                                      ...field.style,
                                      rotation: clamp(
                                        Number(event.target.value || 0),
                                        -180,
                                        180
                                      ),
                                    },
                                  })
                                )
                              }
                              className="h-9 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            />
                          </label>
                        </div>
                      ) : null}

                      {selectedObjectKind === "rectangle" ||
                      selectedObjectKind === "ellipse" ? (
                        <div className="space-y-3">
                          {isSquareTemplateField(selectedField) ? (
                            <div className="rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3 text-[12px] leading-5 text-[#8ca3b2]">
                              This shape is locked to a 1:1 square. Resize it on canvas and it will stay square.
                            </div>
                          ) : null}
                          <label className="block">
                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                              Radius
                            </div>
                            <select
                              value={selectedField.style?.radius ?? "soft"}
                              onChange={(event) =>
                                updateDraftFieldById(
                                  selectedField.id,
                                  (field) => ({
                                    ...field,
                                    style: {
                                      ...field.style,
                                      radius: event.target.value as NonNullable<
                                        ModuleTemplateField["style"]
                                      >["radius"],
                                    },
                                  })
                                )
                              }
                              className="h-9 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                            >
                              <option value="none">Sharp</option>
                              <option value="soft">Soft</option>
                              <option value="round">Round</option>
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <details className="border border-white/8 bg-transparent px-3 py-2.5">
                        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8ca3b2]">
                          Position
                        </summary>
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {(["x", "y", "w", "h"] as const).map((key) => (
                            <label key={key} className="block">
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
                                {key}
                              </div>
                              <input
                                type="number"
                                min={key === "w" || key === "h" ? 2 : 0}
                                max={
                                  key === "x"
                                    ? getFieldSurface(selectedField) ===
                                      "pasteboard"
                                      ? MODULE_SCENE_COLUMNS - 1
                                      : MODULE_CANVAS_COLUMNS - 1
                                    : key === "y"
                                    ? getFieldSurface(selectedField) ===
                                      "pasteboard"
                                      ? MODULE_SCENE_ROWS - 1
                                      : MODULE_CANVAS_ROWS - 1
                                    : key === "w"
                                    ? getFieldSurface(selectedField) ===
                                      "pasteboard"
                                      ? MODULE_SCENE_COLUMNS
                                      : MODULE_CANVAS_COLUMNS
                                    : getFieldSurface(selectedField) ===
                                      "pasteboard"
                                    ? MODULE_SCENE_ROWS
                                    : MODULE_CANVAS_ROWS
                                }
                                value={selectedField.layout?.[key] ?? 0}
                                onChange={(event) => {
                                  const nextValue = Number(
                                    event.target.value || 0
                                  );
                                  setDraft((current) => ({
                                    ...current,
                                    fields: current.fields.map((field) => {
                                      if (field.id !== selectedField.id) {
                                        return field;
                                      }
                                      const layout =
                                        field.layout ??
                                        createDefaultFieldLayout(
                                          current.kind,
                                          current.fields.findIndex(
                                            (item) => item.id === field.id
                                          ),
                                          current.fields.length
                                        );
                                      return {
                                        ...field,
                                        layout: clampLayoutToSurface(
                                          {
                                            ...layout,
                                            [key]: nextValue,
                                          },
                                          getFieldSurface(field)
                                        ),
                                      };
                                    }),
                                  }));
                                }}
                                className="h-9 w-full border border-white/10 bg-white/[0.03] px-2 text-[12px] text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                              />
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm leading-6 text-[#7f95a6]">
                      Select an object to edit it. Use{" "}
                      <span className="text-[#a7bac7]">Ctrl/Cmd+C</span>,{" "}
                      <span className="text-[#a7bac7]">Ctrl/Cmd+V</span>, and{" "}
                      <span className="text-[#a7bac7]">Backspace</span>.
                    </div>
                  )}
                </section>
    </>
  );
}
