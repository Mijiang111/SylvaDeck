import type { Dispatch, SetStateAction } from "react";
import { BarChart3, Circle, Database, Minus, Sparkles, Square, Type } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type {
  ModuleCanvasObjectKind,
  ModuleRegistryEntry,
  ModuleTemplateField,
} from "@/features/studio/types";

import type { CanvasObjectPreset } from "../helpers";

type TemplateCanvasToolbarProps = {
  isActive: boolean;
  view: {
    selectedField: ModuleTemplateField | null;
    selectedObjectKind: ModuleCanvasObjectKind | null;

  };
  actions: {
    setDraft: Dispatch<SetStateAction<ModuleRegistryEntry>>;

    addCanvasObject: (
      kind: ModuleCanvasObjectKind,
      preset?: CanvasObjectPreset
    ) => void;

  };
};

export function TemplateCanvasToolbar({
  isActive,
  view,
  actions,
}: TemplateCanvasToolbarProps) {
  const { selectedField, selectedObjectKind } = view;
  const { setDraft, addCanvasObject } = actions;

  if (!isActive) {
    return null;
  }

  return (
                <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
                  <div className="pointer-events-auto flex w-full max-w-[860px] flex-col items-center gap-2">
                    {selectedField ? (
                      <div className="w-full max-w-[560px] rounded-[2px] border border-white/10 bg-[#0e1429]/88 p-2 text-white shadow-[0_22px_40px_rgba(0,0,0,0.34)] backdrop-blur">
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[#95a3c9]">
                            Comment
                          </div>
                          <div className="truncate text-[11px] text-[#cad3ea]">
                            {selectedField.label}
                          </div>
                        </div>
                        <Textarea
                          value={selectedField.description ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              fields: current.fields.map((field) =>
                                field.id === selectedField.id
                                  ? {
                                      ...field,
                                      description: event.target.value,
                                    }
                                  : field
                              ),
                            }))
                          }
                          placeholder={
                            selectedObjectKind === "slot"
                              ? "Describe what AI should write in this slot."
                              : selectedObjectKind === "data"
                              ? "Describe what this data proves."
                              : selectedObjectKind === "text"
                              ? "Describe the locked template copy or label."
                              : "Describe what this block should communicate."
                          }
                          className="min-h-[64px] border border-white/10 bg-white/[0.04] px-2 py-2 text-xs leading-5 text-white placeholder:text-[#8c9abf]"
                        />
                      </div>
                    ) : null}

                    <div className="max-w-full overflow-x-auto">
                      <div className="inline-flex items-center gap-1 rounded-[2px] border border-white/10 bg-[#0e1429]/86 p-1.5 text-white shadow-[0_22px_40px_rgba(0,0,0,0.34)] backdrop-blur">
                        {[
                          {
                            label: "AI Text",
                            icon: Sparkles,
                            kind: "slot" as const,
                          },
                          {
                            label: "Locked Text",
                            icon: Type,
                            kind: "text" as const,
                          },
                          {
                            label: "Data",
                            icon: Database,
                            kind: "data" as const,
                          },
                          {
                            label: "Chart",
                            icon: BarChart3,
                            kind: "chart" as const,
                          },
                          {
                            label: "Rect",
                            icon: Square,
                            kind: "rectangle" as const,
                          },
                          {
                            label: "Square",
                            icon: Square,
                            kind: "rectangle" as const,
                            preset: "square" as const,
                          },
                          {
                            label: "Circle",
                            icon: Circle,
                            kind: "ellipse" as const,
                          },
                          { label: "Line", icon: Minus, kind: "line" as const },
                        ].map((tool) => {
                          const Icon = tool.icon;
                          return (
                            <button
                              key={`${tool.kind}-${tool.label}`}
                              type="button"
                              onClick={() => addCanvasObject(tool.kind, tool.preset)}
                              className="inline-flex items-center gap-1.5 rounded-[2px] px-3 py-2 text-sm font-semibold text-[#eef3ff] transition hover:bg-white/10"
                              title={`Add ${tool.label}`}
                            >
                              <Icon className="h-4 w-4" />
                              <span>{tool.label}</span>
                            </button>
                          );
                        })}

                      </div>
                    </div>
                  </div>
                </div>
  );
}
