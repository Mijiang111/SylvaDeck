import type {
  ModuleCanvasObjectKind,
  ModuleTemplateField,
} from "@/features/studio/types";
import {
  getCanvasObjectKind,
  getFieldKindTone,
} from "../helpers";

type TestStagePanelView = {
  colorReady: boolean;
  modulePalette: string[];
  selectedField: ModuleTemplateField | null;
  selectedObjectKind: ModuleCanvasObjectKind | null;
};

type TestStagePanelActions = {
  updateDraftFieldById: (
    fieldId: string,
    updater: (field: ModuleTemplateField) => ModuleTemplateField
  ) => void;
};

type TestStagePanelProps = {
  view: TestStagePanelView;
  actions: TestStagePanelActions;
};

export function TestStagePanel({ view, actions }: TestStagePanelProps) {
  const {
    colorReady,
    modulePalette,
    selectedField,
    selectedObjectKind,
  } = view;
  const {
    updateDraftFieldById,
  } = actions;
  return (
    <>
                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Template visual system
                    </div>
                    <div
                      className={[
                        "text-[10px] font-semibold uppercase tracking-[0.16em]",
                        colorReady ? "text-[#68c197]" : "text-[#d8a45f]",
                      ].join(" ")}
                    >
                      {colorReady ? "Ready" : "Needs range"}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {[
                      {
                        label: "Primary ink",
                        detail: "Headlines, strong labels, and template anchors",
                        color: modulePalette[0] ?? "#173043",
                      },
                      {
                        label: "Accent",
                        detail: "Highlights, charts, and emphasis moments",
                        color: modulePalette[1] ?? "#cc8b41",
                      },
                      {
                        label: "Surface",
                        detail: "Soft fills for blocks and containers",
                        color: modulePalette[2] ?? "#dcecf3",
                      },
                      {
                        label: "Line",
                        detail: "Borders, guides, and muted structure",
                        color: modulePalette[3] ?? "#9bb6c2",
                      },
                    ].map((role) => (
                      <div
                        key={role.label}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
                      >
                        <span
                          className="mt-1 h-4 w-4 rounded-full border border-white/10"
                          style={{
                            background: role.color,
                            boxShadow: `0 0 16px ${role.color}55`,
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {role.label}
                          </div>
                          <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                            {role.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="border-b border-white/8 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Palette tokens
                    </div>
                    <div
                      className={[
                        "text-[10px] font-semibold uppercase tracking-[0.16em]",
                        colorReady ? "text-[#68c197]" : "text-[#d8a45f]",
                      ].join(" ")}
                    >
                      {modulePalette.length} tones
                    </div>
                  </div>
                  {modulePalette.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {modulePalette.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            if (!selectedField) {
                              return;
                            }
                            updateDraftFieldById(selectedField.id, (field) => ({
                              ...field,
                              style: {
                                ...field.style,
                                fill:
                                  getCanvasObjectKind(field) === "text"
                                    ? color
                                    : field.style?.fill ?? color,
                                stroke: color,
                              },
                            }));
                          }}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-white/[0.08]"
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-white/10"
                            style={{
                              background: color,
                              boxShadow: `0 0 14px ${color}66`,
                            }}
                          />
                          {color}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm leading-6 text-[#8dd0ab]">
                      Start coloring the layout. Once the template uses more than
                      one intentional tone, the reusable color system is ready.
                    </div>
                  )}
                </section>

                <section className="px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                      Selected object
                    </div>
                    <div className="text-[10px] text-[#627987]">
                      {selectedField ? getFieldKindTone(selectedField) : "None"}
                    </div>
                  </div>
                  {selectedField ? (
                    <div className="mt-3 space-y-3">
                      <div className="border border-white/8 px-3 py-3">
                        <div className="text-sm font-semibold text-white">
                          {selectedField.label}
                        </div>
                        <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                          Define reusable tones here, not final client brand
                          colors. Release can later map these roles to a deck
                          theme.
                        </div>
                      </div>
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
                    </div>
                  ) : (
                    <div className="mt-3 text-sm leading-6 text-[#7f95a6]">
                      Select a layout block to tune its fill and stroke as part
                      of the reusable color system.
                    </div>
                  )}
                </section>
    </>
  );
}
